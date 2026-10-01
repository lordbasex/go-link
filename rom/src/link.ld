/* Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> */
/* The program lives at the start of the 68000's ROM (vectors first) and
   its variables in the board's work RAM (0xff0000-0xffffff). */

MEMORY
{
  rom (rx)  : ORIGIN = 0x000000, LENGTH = 0x100000
  ram (rwx) : ORIGIN = 0xff0000, LENGTH = 0x00f000
}

ENTRY(_start)

SECTIONS
{
  .text :
  {
    KEEP(*(.vectors))
    *(.text .text.*)
    *(.rodata .rodata.*)
    . = ALIGN(2);
  } > rom

  /* the lab state (lab_state.h) first, at 0xff0000: a fixed address
     even for a reader without the symbol map */
  .lab_state (NOLOAD) :
  {
    KEEP(*(.lab_state))
    . = ALIGN(2);
  } > ram

  .data :
  {
    _data_start = .;
    *(.data .data.*)
    . = ALIGN(2);
    _data_end = .;
  } > ram AT > rom
  _data_load = LOADADDR(.data);

  .bss (NOLOAD) :
  {
    _bss_start = .;
    *(.bss .bss.*)
    *(COMMON)
    . = ALIGN(2);
    _bss_end = .;
  } > ram

  /DISCARD/ : { *(.comment) *(.note*) *(.eh_frame*) }
}
