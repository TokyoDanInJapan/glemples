// GLemples — real-time WebGL image warper
// Copyright (C) 2026 Daniel Hebberd
//
// SPDX-License-Identifier: GPL-3.0-or-later

/// <reference types="vite/client" />

declare module "*.vert?raw" {
  const src: string;
  export default src;
}
declare module "*.frag?raw" {
  const src: string;
  export default src;
}

declare module "*.yaml" {
  const data: unknown;
  export default data;
}
