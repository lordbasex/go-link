| Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
|
| 68000 start-up for the CPS-1 board: the vector table, the reset entry
| (supervisor mode, stack, .data copied from ROM, .bss cleared, then main)
| and the level 2 interrupt the board raises at every vblank.

	.section .vectors,"ax"
	.long	0x00fff000		| 0: initial supervisor stack (top of work RAM)
	.long	_start			| 1: initial PC
	.rept	24			| 2-25: errors, spurious, level 1
	.long	default_handler
	.endr
	.long	vblank_handler		| 26: level 2 autovector, the vblank
	.rept	229			| 27-255
	.long	default_handler
	.endr

	.text
	.globl	_start
_start:
	move.w	#0x2700,%sr		| supervisor, every interrupt masked
	lea	0x00fff000,%sp

	| copy .data from ROM to RAM
	lea	_data_load,%a0
	lea	_data_start,%a1
	lea	_data_end,%a2
1:	cmpa.l	%a2,%a1
	bcc.s	2f
	move.w	(%a0)+,(%a1)+
	bra.s	1b

	| clear .bss
2:	lea	_bss_start,%a1
	lea	_bss_end,%a2
3:	cmpa.l	%a2,%a1
	bcc.s	4f
	clr.w	(%a1)+
	bra.s	3b

4:	jsr	main
5:	bra.s	5b

	.globl	vblank_handler
vblank_handler:
	addq.l	#1,frame_count
	rte

	.globl	default_handler
default_handler:
	rte
