// GLemples — real-time WebGL image warper
// Copyright (C) 2026 Daniel Hebberd
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

precision mediump float;

varying vec2 v_uv;

uniform sampler2D u_grid;
uniform sampler2D u_tex0;   // current texture
uniform sampler2D u_tex1;   // next texture (crossfade target)
uniform sampler2D u_prev;   // previous rendered frame (motion blur source)

uniform float u_blend;      // how much of u_prev to keep (0=no blur, ~0.9=heavy blur)
uniform float u_texfade;    // 0=tex0 only, 1=tex1 only
uniform vec2  u_gridSize;   // vec2(UVCELLSX, UVCELLSY)

vec4 crWeights(float t) {
    float t2 = t * t;
    float t3 = t2 * t;
    return 0.5 * vec4(
        -t3 + 2.0*t2 - t,
         3.0*t3 - 5.0*t2 + 2.0,
        -3.0*t3 + 4.0*t2 + t,
         t3 - t2
    );
}

vec2 sampleGrid(vec2 screenUV) {
    vec2 pos  = screenUV * (u_gridSize - 1.0);
    vec2 f    = fract(pos);
    vec4 wx   = crWeights(f.x);
    vec4 wy   = crWeights(f.y);

    vec2 s  = 1.0 / u_gridSize;
    vec2 p0 = (floor(pos) - 0.5) / u_gridSize;

    float x0 = p0.x,           x1 = p0.x + s.x,       x2 = p0.x + 2.0*s.x, x3 = p0.x + 3.0*s.x;
    float y0 = p0.y,           y1 = p0.y + s.y,        y2 = p0.y + 2.0*s.y, y3 = p0.y + 3.0*s.y;

    vec2 r0 = wx[0]*texture2D(u_grid,vec2(x0,y0)).ra + wx[1]*texture2D(u_grid,vec2(x1,y0)).ra + wx[2]*texture2D(u_grid,vec2(x2,y0)).ra + wx[3]*texture2D(u_grid,vec2(x3,y0)).ra;
    vec2 r1 = wx[0]*texture2D(u_grid,vec2(x0,y1)).ra + wx[1]*texture2D(u_grid,vec2(x1,y1)).ra + wx[2]*texture2D(u_grid,vec2(x2,y1)).ra + wx[3]*texture2D(u_grid,vec2(x3,y1)).ra;
    vec2 r2 = wx[0]*texture2D(u_grid,vec2(x0,y2)).ra + wx[1]*texture2D(u_grid,vec2(x1,y2)).ra + wx[2]*texture2D(u_grid,vec2(x2,y2)).ra + wx[3]*texture2D(u_grid,vec2(x3,y2)).ra;
    vec2 r3 = wx[0]*texture2D(u_grid,vec2(x0,y3)).ra + wx[1]*texture2D(u_grid,vec2(x1,y3)).ra + wx[2]*texture2D(u_grid,vec2(x2,y3)).ra + wx[3]*texture2D(u_grid,vec2(x3,y3)).ra;

    return wy[0]*r0 + wy[1]*r1 + wy[2]*r2 + wy[3]*r3;
}

void main() {
  vec2 warpUV = sampleGrid(v_uv);

  vec3 texColor = mix(
    texture2D(u_tex0, warpUV).rgb,
    texture2D(u_tex1, warpUV).rgb,
    u_texfade
  );

  vec3 prevColor = texture2D(u_prev, v_uv).rgb;
  gl_FragColor = vec4(mix(texColor, prevColor, u_blend), 1.0);
}
