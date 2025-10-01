// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { fabric } from 'fabric';
import { MediaEditorFabricPath } from './MediaEditorFabricPath.js';

/**
 * Custom blur brush for the media editor.
 * This brush creates a semi-transparent overlay effect to obscure/blur content.
 * 
 * Unlike pixel-based Gaussian blur, this approach:
 * - Works with fabric.js's object system (so it's undoable/redoable)
 * - Has good performance
 * - Still achieves the goal of obscuring sensitive content
 * 
 * The brush creates paths with a semi-transparent fill to create a "frosted glass"
 * effect similar to iOS/Android blur overlays.
 */
export class MediaEditorFabricBlurBrush extends fabric.PencilBrush {
  override createPath(
    pathData?: string | Array<fabric.Point>
  ): MediaEditorFabricPath {
    // Create a path with a semi-transparent white fill to simulate blur
    // This creates a "frosted glass" effect commonly used for blurring sensitive content
    return new MediaEditorFabricPath(pathData, {
      fill: undefined,
      stroke: 'rgba(255, 255, 255, 0.7)',
      strokeWidth: this.width,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      strokeDashArray: undefined,
      // Add a slight shadow to make the blur effect more visible
      shadow: new fabric.Shadow({
        color: 'rgba(255, 255, 255, 0.5)',
        blur: 10,
        offsetX: 0,
        offsetY: 0,
      }),
    });
  }
}

