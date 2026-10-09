/* Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> */
/*
 * savecheck: does a libretro core save a game whole?
 *
 * It plays the same game twice with the same buttons, each time in a new
 * process (a fresh board):
 *
 *   1. uninterrupted: power on, play N frames, save, play M more frames;
 *   2. resumed: power on, run K frames, load that save, play the same M frames.
 *
 * A save state that keeps everything makes both runs produce the same
 * picture and the same sound, frame by frame. It prints how many of the M
 * frames match, the sound level second by second in both runs, and the first
 * frame that differs (optionally as two PPM pictures).
 *
 *   savecheck [options] CORE GAME
 *
 * Exit status: 0 identical, 1 different, 2 error. POSIX only (fork, dlopen).
 * MIT license, like libretro.h.
 */
#define _POSIX_C_SOURCE 200809L
#define _DARWIN_C_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <math.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

#include "libretro.h"

#define MAX_OPTIONS 512
#define PATH_LEN 4096

/* ---------------------------------------------------------------- options */

static struct {
	const char *core, *game, *json, *diff, *system;
	int save_at, frames, load_after;
	bool quiet;
	const char *set[64]; /* --option KEY=VALUE */
	int nset;
} opt = {.save_at = 2400, .frames = 600, .load_after = 1};

static void usage(void)
{
	fprintf(stderr,
		"usage: savecheck [options] CORE GAME\n"
		"  --save-at N      frame the first run saves at (default 2400)\n"
		"  --frames M       frames compared after the save (default 600)\n"
		"  --load-after K   frames the second board runs before loading (default 1)\n"
		"  --system DIR     a system directory to copy for each run (BIOS files)\n"
		"  --option K=V     set a core option (repeatable; the others keep their\n"
		"                   defaults). mame2003-plus: mame2003-plus_skip_disclaimer=enabled\n"
		"                   and mame2003-plus_skip_warnings=enabled, or a freshly\n"
		"                   started board draws those messages over the loaded game\n"
		"  --json FILE      also write the result as JSON\n"
		"  --diff DIR       write the first different frame of both runs as PPM\n"
		"  --quiet          print only the summary line\n"
		"Exit status: 0 identical, 1 different, 2 error.\n");
	exit(2);
}

static void die(const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	fputs("savecheck: ", stderr);
	vfprintf(stderr, fmt, ap);
	fputc('\n', stderr);
	va_end(ap);
	exit(2);
}

/* Writes a path into a PATH_LEN buffer, or stops if it does not fit. */
static void make_path(char *dst, const char *fmt, ...)
{
	va_list ap;
	va_start(ap, fmt);
	int n = vsnprintf(dst, PATH_LEN, fmt, ap);
	va_end(ap);
	if (n < 0 || n >= PATH_LEN)
		die("path too long");
}

/* ------------------------------------------------------------------ input */

/*
 * The buttons: someone at the cabinet. A coin and Start for players 1 and 2
 * every 8 seconds (so a game in attract mode starts, and one that ended
 * starts again), then the joystick and the first three buttons in turn, a
 * different pattern for each player. Only the frame number decides it, so
 * both runs press the same buttons at the same frames.
 */
static int16_t pad_buttons(unsigned port, long frame)
{
	if (port > 1 || frame < 120)
		return 0;
	long t = frame % 480;
	if (t < 8)
		return 1 << RETRO_DEVICE_ID_JOYPAD_SELECT;
	if (t >= 60 && t < 68)
		return 1 << RETRO_DEVICE_ID_JOYPAD_START;
	static const int moves[] = {
		RETRO_DEVICE_ID_JOYPAD_RIGHT, RETRO_DEVICE_ID_JOYPAD_B, RETRO_DEVICE_ID_JOYPAD_UP,
		RETRO_DEVICE_ID_JOYPAD_LEFT, RETRO_DEVICE_ID_JOYPAD_A, RETRO_DEVICE_ID_JOYPAD_DOWN,
		RETRO_DEVICE_ID_JOYPAD_Y, RETRO_DEVICE_ID_JOYPAD_RIGHT,
	};
	long step = (frame / (port ? 23 : 17)) % 8;
	int16_t bits = (int16_t)(1 << moves[step]);
	if ((frame / 11) % 3 == 0)
		bits |= 1 << RETRO_DEVICE_ID_JOYPAD_B;
	return bits;
}

/* ---------------------------------------------------------- one core run */

/* What a run records for each compared frame. */
struct record {
	uint64_t picture; /* FNV-1a of the visible pixels */
	uint64_t sound;   /* FNV-1a of the samples */
	double level;     /* sum of the squared samples */
	uint32_t samples; /* how many samples (both channels) */
};

static struct {
	void *lib;
	void (*init)(void);
	void (*deinit)(void);
	void (*get_system_info)(struct retro_system_info *);
	void (*get_system_av_info)(struct retro_system_av_info *);
	void (*set_environment)(retro_environment_t);
	void (*set_video_refresh)(retro_video_refresh_t);
	void (*set_audio_sample)(retro_audio_sample_t);
	void (*set_audio_sample_batch)(retro_audio_sample_batch_t);
	void (*set_input_poll)(retro_input_poll_t);
	void (*set_input_state)(retro_input_state_t);
	void (*run)(void);
	size_t (*serialize_size)(void);
	bool (*serialize)(void *, size_t);
	bool (*unserialize)(const void *, size_t);
	bool (*load_game)(const struct retro_game_info *);
	void (*unload_game)(void);

	char system_dir[PATH_LEN], save_dir[PATH_LEN];
	enum retro_pixel_format format;
	struct { char *key, *value; } options[MAX_OPTIONS];
	int noptions;

	long frame;      /* the game's frame number, the same in both runs */
	bool recording;  /* the current frame goes into rec */
	struct record rec;
	uint64_t last_picture;
	/* the last picture, kept when it may be written as PPM */
	bool keep;
	uint8_t *pixels;
	unsigned width, height;
	size_t pitch;
} k;

static void fnv(uint64_t *h, const void *data, size_t n)
{
	const uint8_t *p = data;
	for (size_t i = 0; i < n; i++) {
		*h ^= p[i];
		*h *= 0x100000001b3ULL;
	}
}

static void *sym(const char *name)
{
	void *f = dlsym(k.lib, name);
	if (!f)
		die("%s: no %s", opt.core, name);
	return f;
}

/* The first value of a declaration "Description; first|second|...". */
static char *default_value(const char *decl)
{
	const char *v = strstr(decl, "; ");
	if (!v)
		return NULL;
	v += 2;
	size_t n = strcspn(v, "|");
	return n ? strndup(v, n) : NULL;
}

static void log_printf(enum retro_log_level level, const char *fmt, ...)
{
	if (level < RETRO_LOG_WARN || opt.quiet)
		return;
	va_list ap;
	va_start(ap, fmt);
	vfprintf(stderr, fmt, ap);
	va_end(ap);
}

static bool environment(unsigned cmd, void *data)
{
	switch (cmd & ~RETRO_ENVIRONMENT_EXPERIMENTAL) {
	case RETRO_ENVIRONMENT_GET_CAN_DUPE:
		*(bool *)data = true;
		return true;
	case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT:
		k.format = *(enum retro_pixel_format *)data;
		return k.format <= RETRO_PIXEL_FORMAT_RGB565;
	case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
		*(const char **)data = k.system_dir;
		return true;
	case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY:
		*(const char **)data = k.save_dir;
		return true;
	case RETRO_ENVIRONMENT_SET_VARIABLES:
		/* Every option keeps its default: a core may read an unanswered
		   option as zero. */
		for (const struct retro_variable *v = data; v && v->key; v++) {
			char *def = v->value ? default_value(v->value) : NULL;
			if (def && k.noptions < MAX_OPTIONS) {
				k.options[k.noptions].key = strdup(v->key);
				k.options[k.noptions++].value = def;
			} else
				free(def);
		}
		return true;
	case RETRO_ENVIRONMENT_GET_VARIABLE: {
		struct retro_variable *v = data;
		size_t n = strlen(v->key);
		for (int i = 0; i < opt.nset; i++)
			if (!strncmp(opt.set[i], v->key, n) && opt.set[i][n] == '=') {
				v->value = opt.set[i] + n + 1;
				return true;
			}
		for (int i = 0; i < k.noptions; i++)
			if (!strcmp(k.options[i].key, v->key)) {
				v->value = k.options[i].value;
				return true;
			}
		return false;
	}
	case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE:
		*(bool *)data = false;
		return true;
	case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION:
		*(unsigned *)data = 0; /* plain variables */
		return true;
	case RETRO_ENVIRONMENT_GET_LOG_INTERFACE:
		((struct retro_log_callback *)data)->log = log_printf;
		return true;
	case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS:
		return true;
	case RETRO_ENVIRONMENT_GET_AUDIO_VIDEO_ENABLE:
		*(int *)data = 3;
		return true;
	case RETRO_ENVIRONMENT_GET_LANGUAGE:
		*(unsigned *)data = RETRO_LANGUAGE_ENGLISH;
		return true;
	case RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL:
	case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:
	case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
	case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME:
	case RETRO_ENVIRONMENT_SET_GEOMETRY:
	case RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO:
	case RETRO_ENVIRONMENT_SET_SERIALIZATION_QUIRKS:
		return true;
	default:
		return false;
	}
}

static size_t bytes_per_pixel(void)
{
	return k.format == RETRO_PIXEL_FORMAT_XRGB8888 ? 4 : 2;
}

static void video_refresh(const void *data, unsigned width, unsigned height, size_t pitch)
{
	if (data) {
		uint64_t h = 0xcbf29ce484222325ULL;
		fnv(&h, &width, sizeof width);
		fnv(&h, &height, sizeof height);
		const uint8_t *row = data;
		for (unsigned y = 0; y < height; y++, row += pitch)
			fnv(&h, row, width * bytes_per_pixel());
		k.last_picture = h;
		if (k.keep) {
			free(k.pixels);
			k.pixels = malloc(pitch * height);
			memcpy(k.pixels, data, pitch * height);
			k.width = width, k.height = height, k.pitch = pitch;
		}
	}
	/* a duped frame repeats the last picture */
	if (k.recording)
		k.rec.picture = k.last_picture;
}

static void count_samples(const int16_t *s, size_t n)
{
	if (!k.recording)
		return;
	fnv(&k.rec.sound, s, n * sizeof *s);
	for (size_t i = 0; i < n; i++)
		k.rec.level += (double)s[i] * s[i];
	k.rec.samples += (uint32_t)n;
}

static size_t audio_batch(const int16_t *data, size_t frames)
{
	count_samples(data, frames * 2);
	return frames;
}

static void audio_sample(int16_t left, int16_t right)
{
	int16_t s[2] = {left, right};
	count_samples(s, 2);
}

static void input_poll(void) {}

static int16_t input_state(unsigned port, unsigned device, unsigned index, unsigned id)
{
	(void)index;
	if (device != RETRO_DEVICE_JOYPAD)
		return 0;
	int16_t bits = pad_buttons(port, k.frame);
	if (id == RETRO_DEVICE_ID_JOYPAD_MASK)
		return bits;
	return (bits >> id) & 1;
}

static void make_dir(const char *dir)
{
	if (mkdir(dir, 0700) && errno != EEXIST)
		die("cannot create %s: %s", dir, strerror(errno));
}

static void open_core(const char *work)
{
	make_dir(work);
	make_path(k.system_dir, "%s/system", work);
	make_path(k.save_dir, "%s/saves", work);
	if (opt.system) {
		char cmd[PATH_LEN];
		make_path(cmd, "cp -R '%s' '%s'", opt.system, k.system_dir);
		if (system(cmd) != 0)
			die("cannot copy %s", opt.system);
	} else
		make_dir(k.system_dir);
	make_dir(k.save_dir);

	k.lib = dlopen(opt.core, RTLD_NOW | RTLD_LOCAL);
	if (!k.lib)
		die("%s", dlerror());
	k.init = sym("retro_init");
	k.deinit = sym("retro_deinit");
	k.get_system_info = sym("retro_get_system_info");
	k.get_system_av_info = sym("retro_get_system_av_info");
	k.set_environment = sym("retro_set_environment");
	k.set_video_refresh = sym("retro_set_video_refresh");
	k.set_audio_sample = sym("retro_set_audio_sample");
	k.set_audio_sample_batch = sym("retro_set_audio_sample_batch");
	k.set_input_poll = sym("retro_set_input_poll");
	k.set_input_state = sym("retro_set_input_state");
	k.run = sym("retro_run");
	k.serialize_size = sym("retro_serialize_size");
	k.serialize = sym("retro_serialize");
	k.unserialize = sym("retro_unserialize");
	k.load_game = sym("retro_load_game");
	k.unload_game = sym("retro_unload_game");

	k.set_environment(environment);
	k.init();
	k.set_video_refresh(video_refresh);
	k.set_audio_sample(audio_sample);
	k.set_audio_sample_batch(audio_batch);
	k.set_input_poll(input_poll);
	k.set_input_state(input_state);

	struct retro_system_info info = {0};
	k.get_system_info(&info);
	struct retro_game_info game = {.path = opt.game};
	if (!info.need_fullpath) {
		FILE *f = fopen(opt.game, "rb");
		if (!f)
			die("cannot read %s", opt.game);
		fseek(f, 0, SEEK_END);
		long n = ftell(f);
		fseek(f, 0, SEEK_SET);
		void *buf = malloc((size_t)n);
		if (fread(buf, 1, (size_t)n, f) != (size_t)n)
			die("cannot read %s", opt.game);
		fclose(f);
		game.data = buf, game.size = (size_t)n;
	}
	if (!k.load_game(&game))
		die("%s does not load %s", opt.core, opt.game);
}

static void run_frame(void)
{
	k.rec = (struct record){.sound = 0xcbf29ce484222325ULL};
	k.run();
	k.frame++;
}

/* Plays the compared frames and writes their records to out. */
static void record_frames(FILE *out, int shot, const char *ppm)
{
	k.recording = true;
	for (int i = 0; i < opt.frames; i++) {
		k.keep = ppm && i == shot;
		run_frame();
		fwrite(&k.rec, sizeof k.rec, 1, out);
		if (k.keep) {
			k.keep = false;
			FILE *f = fopen(ppm, "wb");
			if (!f)
				die("cannot write %s", ppm);
			fprintf(f, "P6\n%u %u\n255\n", k.width, k.height);
			for (unsigned y = 0; y < k.height; y++)
				for (unsigned x = 0; x < k.width; x++) {
					const uint8_t *p = k.pixels + y * k.pitch + x * bytes_per_pixel();
					uint8_t rgb[3];
					if (k.format == RETRO_PIXEL_FORMAT_XRGB8888) {
						rgb[0] = p[2], rgb[1] = p[1], rgb[2] = p[0];
					} else {
						uint16_t v = (uint16_t)(p[0] | p[1] << 8);
						if (k.format == RETRO_PIXEL_FORMAT_RGB565)
							rgb[0] = (uint8_t)((v >> 11) << 3), rgb[1] = (uint8_t)(((v >> 5) & 63) << 2), rgb[2] = (uint8_t)((v & 31) << 3);
						else
							rgb[0] = (uint8_t)(((v >> 10) & 31) << 3), rgb[1] = (uint8_t)(((v >> 5) & 31) << 3), rgb[2] = (uint8_t)((v & 31) << 3);
					}
					fwrite(rgb, 1, 3, f);
				}
			fclose(f);
		}
	}
	k.recording = false;
}

/* The first run: play up to the save point, save, then record. */
static void run_uninterrupted(const char *work, const char *state_path, const char *rec_path, int shot, const char *ppm)
{
	open_core(work);
	while (k.frame < opt.save_at)
		run_frame();
	size_t n = k.serialize_size();
	if (n == 0)
		die("the core saves nothing for this game (retro_serialize_size is 0)");
	void *state = malloc(n);
	if (!k.serialize(state, n))
		die("retro_serialize failed");
	FILE *f = fopen(state_path, "wb");
	if (!f || fwrite(state, 1, n, f) != n)
		die("cannot write %s", state_path);
	fclose(f);
	FILE *out = fopen(rec_path, "wb");
	if (!out)
		die("cannot write %s", rec_path);
	record_frames(out, shot, ppm);
	fclose(out);
	k.unload_game();
	k.deinit();
}

/* The second run: a fresh board runs a few frames, loads the save and
   plays the same frames with the same buttons. */
static void run_resumed(const char *work, const char *state_path, const char *rec_path, int shot, const char *ppm)
{
	open_core(work);
	FILE *f = fopen(state_path, "rb");
	if (!f)
		die("cannot read %s", state_path);
	fseek(f, 0, SEEK_END);
	long n = ftell(f);
	fseek(f, 0, SEEK_SET);
	void *state = malloc((size_t)n);
	if (fread(state, 1, (size_t)n, f) != (size_t)n)
		die("cannot read %s", state_path);
	fclose(f);
	/* A core may refuse a state before its first frame, so it retries for
	   a few frames past --load-after. */
	int ran = 0;
	for (;;) {
		k.frame = 0; /* the warm-up frames press nothing */
		run_frame();
		ran++;
		if (ran >= opt.load_after && k.unserialize(state, (size_t)n))
			break;
		if (ran >= opt.load_after + 10)
			die("retro_unserialize refused the state");
	}
	k.frame = opt.save_at;
	FILE *out = fopen(rec_path, "wb");
	if (!out)
		die("cannot write %s", rec_path);
	record_frames(out, shot, ppm);
	fclose(out);
	k.unload_game();
	k.deinit();
}

/* ------------------------------------------------------------ the driver */

/* Runs one of the two runs in a child process (a fresh core). */
static void child(bool resumed, const char *work, const char *state, const char *rec, int shot, const char *ppm)
{
	fflush(NULL);
	pid_t pid = fork();
	if (pid < 0)
		die("fork: %s", strerror(errno));
	if (pid == 0) {
		if (resumed)
			run_resumed(work, state, rec, shot, ppm);
		else
			run_uninterrupted(work, state, rec, shot, ppm);
		fflush(NULL);
		_exit(0);
	}
	int status;
	if (waitpid(pid, &status, 0) < 0 || !WIFEXITED(status) || WEXITSTATUS(status) != 0)
		die("the %s run failed", resumed ? "resumed" : "uninterrupted");
}

static struct record *read_records(const char *path)
{
	struct record *r = calloc((size_t)opt.frames, sizeof *r);
	FILE *f = fopen(path, "rb");
	if (!f || fread(r, sizeof *r, (size_t)opt.frames, f) != (size_t)opt.frames)
		die("cannot read %s", path);
	fclose(f);
	return r;
}

static double fps_of_core(const char *work)
{
	/* The frame rate, from a short run of its own (seconds of sound). */
	char fps_file[PATH_LEN];
	make_path(fps_file, "%s/fps", work);
	fflush(NULL);
	pid_t pid = fork();
	if (pid == 0) {
		opt.quiet = true;
		open_core(work);
		struct retro_system_av_info av = {0};
		k.get_system_av_info(&av);
		FILE *f = fopen(fps_file, "w");
		if (f) {
			fprintf(f, "%f\n", av.timing.fps > 0 ? av.timing.fps : 60.0);
			fclose(f);
		}
		_exit(0);
	}
	int status;
	waitpid(pid, &status, 0);
	double fps = 60;
	FILE *f = fopen(fps_file, "r");
	if (f) {
		if (fscanf(f, "%lf", &fps) != 1)
			fps = 60;
		fclose(f);
	}
	return fps;
}

int main(int argc, char **argv)
{
	int i = 1;
	for (; i < argc && argv[i][0] == '-' && argv[i][1] == '-'; i++) {
		const char *a = argv[i];
		const char *v = i + 1 < argc ? argv[i + 1] : NULL;
		if (!strcmp(a, "--quiet")) {
			opt.quiet = true;
			continue;
		}
		if (!v)
			usage();
		i++;
		if (!strcmp(a, "--save-at"))
			opt.save_at = atoi(v);
		else if (!strcmp(a, "--frames"))
			opt.frames = atoi(v);
		else if (!strcmp(a, "--load-after"))
			opt.load_after = atoi(v);
		else if (!strcmp(a, "--json"))
			opt.json = v;
		else if (!strcmp(a, "--diff"))
			opt.diff = v;
		else if (!strcmp(a, "--system"))
			opt.system = v;
		else if (!strcmp(a, "--option") && strchr(v, '=') && opt.nset < 64)
			opt.set[opt.nset++] = v;
		else
			usage();
	}
	if (argc - i != 2 || opt.save_at < 1 || opt.frames < 1 || opt.load_after < 1)
		usage();
	opt.core = argv[i];
	opt.game = argv[i + 1];

	char tmpl[] = "/tmp/savecheck.XXXXXX";
	char *work = mkdtemp(tmpl);
	if (!work)
		die("mkdtemp: %s", strerror(errno));
	char a_dir[PATH_LEN], b_dir[PATH_LEN], f_dir[PATH_LEN], state[PATH_LEN], a_rec[PATH_LEN], b_rec[PATH_LEN];
	make_path(a_dir, "%s/a", work);
	make_path(b_dir, "%s/b", work);
	make_path(f_dir, "%s/f", work);
	make_path(state, "%s/state", work);
	make_path(a_rec, "%s/a.rec", work);
	make_path(b_rec, "%s/b.rec", work);

	double fps = fps_of_core(f_dir);
	child(false, a_dir, state, a_rec, -1, NULL);
	child(true, b_dir, state, b_rec, -1, NULL);
	struct record *a = read_records(a_rec), *b = read_records(b_rec);

	int same_picture = 0, same_sound = 0, first_diff = -1;
	for (int f = 0; f < opt.frames; f++) {
		bool p = a[f].picture == b[f].picture;
		bool s = a[f].sound == b[f].sound && a[f].samples == b[f].samples;
		same_picture += p;
		same_sound += s;
		if ((!p || !s) && first_diff < 0)
			first_diff = f;
	}
	bool identical = same_picture == opt.frames && same_sound == opt.frames;

	/* The sound level (RMS) per second in both runs. */
	int per = (int)(fps + 0.5);
	int seconds = (opt.frames + per - 1) / per;
	double *la = calloc((size_t)seconds, sizeof *la), *lb = calloc((size_t)seconds, sizeof *lb);
	for (int s = 0; s < seconds; s++) {
		double ea = 0, eb = 0;
		uint64_t na = 0, nb = 0;
		for (int f = s * per; f < (s + 1) * per && f < opt.frames; f++) {
			ea += a[f].level, na += a[f].samples;
			eb += b[f].level, nb += b[f].samples;
		}
		la[s] = na ? sqrt(ea / (double)na) : 0;
		lb[s] = nb ? sqrt(eb / (double)nb) : 0;
	}

	const char *core_name = strrchr(opt.core, '/') ? strrchr(opt.core, '/') + 1 : opt.core;
	const char *game_name = strrchr(opt.game, '/') ? strrchr(opt.game, '/') + 1 : opt.game;
	if (!opt.quiet) {
		printf("savecheck: %s, %s\n", core_name, game_name);
		printf("saved at frame %d, loaded into a fresh board after %d frame(s), %d frames compared\n\n", opt.save_at, opt.load_after, opt.frames);
		printf("picture: %d/%d frames identical\n", same_picture, opt.frames);
		printf("sound:   %d/%d frames identical\n\n", same_sound, opt.frames);
		printf("sound level per second (RMS):\n  second  uninterrupted   resumed\n");
		for (int s = 0; s < seconds; s++)
			printf("  %6d  %13.1f  %8.1f\n", s + 1, la[s], lb[s]);
		printf("\n");
		if (first_diff >= 0) {
			printf("first different frame: %d after the save (frame %d)\n", first_diff, opt.save_at + first_diff);
			/* The frames that differ, as ranges (P picture, S sound). */
			printf("different frames:");
			for (int f = 0; f < opt.frames;) {
				bool p = a[f].picture != b[f].picture;
				bool s = a[f].sound != b[f].sound || a[f].samples != b[f].samples;
				if (!p && !s) {
					f++;
					continue;
				}
				int e = f;
				while (e + 1 < opt.frames && (a[e + 1].picture != b[e + 1].picture) == p &&
				       (a[e + 1].sound != b[e + 1].sound || a[e + 1].samples != b[e + 1].samples) == s)
					e++;
				printf(" %d-%d(%s%s)", f, e, p ? "P" : "", s ? "S" : "");
				f = e + 1;
			}
			printf("\n");
		}
	}
	printf("%s: %s picture %d/%d, sound %d/%d\n", identical ? "IDENTICAL" : "DIFFERENT", game_name, same_picture, opt.frames, same_sound, opt.frames);

	if (opt.diff && first_diff >= 0) {
		mkdir(opt.diff, 0755);
		char pa[PATH_LEN], pb[PATH_LEN], wa[PATH_LEN], wb[PATH_LEN];
		make_path(pa, "%s/frame-%d-uninterrupted.ppm", opt.diff, first_diff);
		make_path(pb, "%s/frame-%d-resumed.ppm", opt.diff, first_diff);
		make_path(wa, "%s/a2", work);
		make_path(wb, "%s/b2", work);
		child(false, wa, state, a_rec, first_diff, pa);
		child(true, wb, state, b_rec, first_diff, pb);
		if (!opt.quiet)
			printf("wrote %s and %s\n", pa, pb);
	}

	if (opt.json) {
		FILE *f = fopen(opt.json, "w");
		if (!f)
			die("cannot write %s", opt.json);
		fprintf(f, "{\n  \"core\": \"%s\",\n  \"game\": \"%s\",\n  \"save_at\": %d,\n  \"load_after\": %d,\n  \"frames\": %d,\n", core_name, game_name, opt.save_at, opt.load_after, opt.frames);
		fprintf(f, "  \"identical_picture\": %d,\n  \"identical_sound\": %d,\n  \"first_different_frame\": %d,\n  \"identical\": %s,\n", same_picture, same_sound, first_diff, identical ? "true" : "false");
		fprintf(f, "  \"sound_level\": {\"uninterrupted\": [");
		for (int s = 0; s < seconds; s++)
			fprintf(f, "%s%.1f", s ? ", " : "", la[s]);
		fprintf(f, "], \"resumed\": [");
		for (int s = 0; s < seconds; s++)
			fprintf(f, "%s%.1f", s ? ", " : "", lb[s]);
		fprintf(f, "]}\n}\n");
		fclose(f);
	}

	char cmd[PATH_LEN];
	make_path(cmd, "rm -rf '%s'", work);
	if (system(cmd) != 0)
		fprintf(stderr, "savecheck: could not remove %s\n", work);
	return identical ? 0 : 1;
}
