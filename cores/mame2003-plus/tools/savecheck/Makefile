# Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
CFLAGS ?= -O2 -Wall -Wextra -std=c11
LDLIBS = -ldl -lm

savecheck: savecheck.c libretro.h
	$(CC) $(CFLAGS) -o $@ savecheck.c $(LDLIBS)

clean:
	rm -f savecheck
