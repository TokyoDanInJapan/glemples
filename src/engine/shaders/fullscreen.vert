// GLemples — real-time WebGL image warper
// Copyright (C) 2026 Daniel Hebberd
//
// SPDX-License-Identifier: GPL-3.0-or-later

attribute vec2 a_pos;
varying vec2 v_uv;

void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
