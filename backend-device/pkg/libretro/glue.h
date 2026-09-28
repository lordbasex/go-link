/* Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> */
/* C side of the libretro frontend: loads a core and forwards its callbacks to Go. */
#ifndef MAME_WEBRTC_GLUE_H
#define MAME_WEBRTC_GLUE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "libretro.h"

typedef struct {
	void *handle;
	void (*init)(void);
	void (*deinit)(void);
	unsigned (*api_version)(void);
	void (*get_system_info)(struct retro_system_info *);
	void (*get_system_av_info)(struct retro_system_av_info *);
	void (*set_environment)(retro_environment_t);
	void (*set_video_refresh)(retro_video_refresh_t);
	void (*set_audio_sample)(retro_audio_sample_t);
	void (*set_audio_sample_batch)(retro_audio_sample_batch_t);
	void (*set_input_poll)(retro_input_poll_t);
	void (*set_input_state)(retro_input_state_t);
	void (*set_controller_port_device)(unsigned, unsigned);
	bool (*load_game)(const struct retro_game_info *);
	void (*unload_game)(void);
	void (*run)(void);
	void (*reset)(void);
	size_t (*serialize_size)(void);
	bool (*serialize)(void *, size_t);
	bool (*unserialize)(const void *, size_t);
} core_t;

int core_open(core_t *c, const char *path, char *err, size_t errlen);
void core_close(core_t *c);
void core_install_callbacks(core_t *c);
void core_init(core_t *c);
void core_deinit(core_t *c);
unsigned core_api_version(core_t *c);
void core_system_info(core_t *c, struct retro_system_info *info);
void core_av_info(core_t *c, struct retro_system_av_info *info);
bool core_load_game(core_t *c, const char *path);
void core_unload_game(core_t *c);
void core_run(core_t *c);
void core_reset(core_t *c);
void core_set_port_device(core_t *c, unsigned port, unsigned device);
size_t core_serialize_size(core_t *c);
bool core_serialize(core_t *c, void *data, size_t size);
bool core_unserialize(core_t *c, const void *data, size_t size);
void glue_set_log(struct retro_log_callback *cb);

#endif
