/* Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> */
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include "glue.h"
#include "_cgo_export.h"

#ifdef _WIN32
#include <windows.h>
static void *lib_open(const char *p) { return (void *)LoadLibraryA(p); }
static void *lib_sym(void *h, const char *n) { return (void *)GetProcAddress((HMODULE)h, n); }
static void lib_close(void *h) { FreeLibrary((HMODULE)h); }
static const char *lib_error(void) { return "LoadLibrary failed"; }
#else
#include <dlfcn.h>
static void *lib_open(const char *p) { return dlopen(p, RTLD_NOW | RTLD_LOCAL); }
static void *lib_sym(void *h, const char *n) { return dlsym(h, n); }
static void lib_close(void *h) { dlclose(h); }
static const char *lib_error(void) { const char *e = dlerror(); return e ? e : "unknown error"; }
#endif

#define LOAD(field, name)                                            \
	do {                                                             \
		*(void **)(&c->field) = lib_sym(c->handle, name);            \
		if (!c->field) {                                             \
			snprintf(err, errlen, "missing symbol %s", name);        \
			lib_close(c->handle);                                    \
			c->handle = NULL;                                        \
			return -2;                                               \
		}                                                            \
	} while (0)

int core_open(core_t *c, const char *path, char *err, size_t errlen) {
	memset(c, 0, sizeof(*c));
	c->handle = lib_open(path);
	if (!c->handle) {
		snprintf(err, errlen, "%s", lib_error());
		return -1;
	}
	LOAD(init, "retro_init");
	LOAD(deinit, "retro_deinit");
	LOAD(api_version, "retro_api_version");
	LOAD(get_system_info, "retro_get_system_info");
	LOAD(get_system_av_info, "retro_get_system_av_info");
	LOAD(set_environment, "retro_set_environment");
	LOAD(set_video_refresh, "retro_set_video_refresh");
	LOAD(set_audio_sample, "retro_set_audio_sample");
	LOAD(set_audio_sample_batch, "retro_set_audio_sample_batch");
	LOAD(set_input_poll, "retro_set_input_poll");
	LOAD(set_input_state, "retro_set_input_state");
	LOAD(set_controller_port_device, "retro_set_controller_port_device");
	LOAD(load_game, "retro_load_game");
	LOAD(unload_game, "retro_unload_game");
	LOAD(run, "retro_run");
	LOAD(reset, "retro_reset");
	LOAD(serialize_size, "retro_serialize_size");
	LOAD(serialize, "retro_serialize");
	LOAD(unserialize, "retro_unserialize");
	return 0;
}

void core_close(core_t *c) {
	if (c->handle) lib_close(c->handle);
	c->handle = NULL;
}

/* Trampolines: libretro expects plain C function pointers. */
static bool env_cb(unsigned cmd, void *data) { return goEnvironment(cmd, data); }
static void video_cb(const void *data, unsigned w, unsigned h, size_t pitch) { goVideoRefresh((void *)data, w, h, pitch); }
static void audio_cb(int16_t l, int16_t r) { goAudioSample(l, r); }
static size_t audio_batch_cb(const int16_t *data, size_t frames) { return goAudioSampleBatch((int16_t *)data, frames); }
static void poll_cb(void) { goInputPoll(); }
static int16_t input_cb(unsigned port, unsigned device, unsigned index, unsigned id) { return goInputState(port, device, index, id); }

static void log_cb(enum retro_log_level level, const char *fmt, ...) {
	char buf[1024];
	va_list ap;
	va_start(ap, fmt);
	vsnprintf(buf, sizeof(buf), fmt, ap);
	va_end(ap);
	goLog((int)level, buf);
}

void glue_set_log(struct retro_log_callback *cb) { cb->log = log_cb; }

void core_install_callbacks(core_t *c) {
	c->set_environment(env_cb);
	c->set_video_refresh(video_cb);
	c->set_audio_sample(audio_cb);
	c->set_audio_sample_batch(audio_batch_cb);
	c->set_input_poll(poll_cb);
	c->set_input_state(input_cb);
}

void core_init(core_t *c) { c->init(); }
void core_deinit(core_t *c) { c->deinit(); }
unsigned core_api_version(core_t *c) { return c->api_version(); }
void core_system_info(core_t *c, struct retro_system_info *info) { c->get_system_info(info); }
void core_av_info(core_t *c, struct retro_system_av_info *info) { c->get_system_av_info(info); }

bool core_load_game(core_t *c, const char *path) {
	struct retro_game_info g;
	memset(&g, 0, sizeof(g));
	g.path = path;
	return c->load_game(&g);
}

void core_unload_game(core_t *c) { c->unload_game(); }
void core_run(core_t *c) { c->run(); }
void core_reset(core_t *c) { c->reset(); }
void core_set_port_device(core_t *c, unsigned port, unsigned device) { c->set_controller_port_device(port, device); }
size_t core_serialize_size(core_t *c) { return c->serialize_size(); }
bool core_serialize(core_t *c, void *data, size_t size) { return c->serialize(data, size); }
bool core_unserialize(core_t *c, const void *data, size_t size) { return c->unserialize(data, size); }
