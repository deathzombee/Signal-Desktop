// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { fabric } from 'fabric';

/**
 * Custom blur brush for the media editor.
 * This brush applies a Gaussian blur effect to the canvas where the user draws.
 * 
 * The implementation works by:
 * 1. Tracking the mouse path as the user draws
 * 2. On mouse up, applying a blur filter to the regions covered by the brush stroke
 * 3. Using a circular brush shape to determine the blur region
 */
export class MediaEditorFabricBlurBrush extends fabric.BaseBrush {
  private path: Array<fabric.Point> = [];
  private blurRadius = 10;

  /**
   * Called when the user starts drawing (mouse down)
   */
  override onMouseDown(pointer: fabric.Point): void {
    this.path = [pointer];
  }

  /**
   * Called as the user moves the mouse while drawing
   */
  override onMouseMove(pointer: fabric.Point): void {
    if (!this.canvas) {
      return;
    }

    this.path.push(pointer);

    // Draw a preview circle to show where the blur will be applied
    const ctx = this.canvas.contextTop;
    if (ctx) {
      ctx.clearRect(0, 0, this.canvas.width || 0, this.canvas.height || 0);
      
      // Draw semi-transparent circles along the path to show the blur area
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#ffffff';
      
      for (let i = 0; i < this.path.length; i += 1) {
        const point = this.path[i];
        ctx.beginPath();
        ctx.arc(point.x, point.y, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Called when the user stops drawing (mouse up)
   * This is where we apply the actual blur effect
   */
  override onMouseUp(): void {
    if (!this.canvas || this.path.length === 0) {
      return;
    }

    // Get the main canvas context
    const ctx = this.canvas.getContext();
    const canvasEl = this.canvas.getElement();
    
    if (!ctx || !canvasEl) {
      return;
    }

    // Apply blur along the drawn path
    this.applyBlurAlongPath(ctx, canvasEl);

    // Clear the preview
    const topCtx = this.canvas.contextTop;
    if (topCtx) {
      topCtx.clearRect(0, 0, this.canvas.width || 0, this.canvas.height || 0);
    }

    // Clear the path
    this.path = [];

    // Trigger a re-render
    this.canvas.renderAll();
  }

  /**
   * Apply Gaussian blur along the drawn path
   */
  private applyBlurAlongPath(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    const brushRadius = this.width / 2;
    const pixelRatio = window.devicePixelRatio || 1;

    // Process the path in segments to avoid performance issues
    for (let i = 0; i < this.path.length; i += 1) {
      const point = this.path[i];
      
      // Calculate the region to blur (circular area around the point)
      const x = Math.max(0, Math.floor((point.x - brushRadius) * pixelRatio));
      const y = Math.max(0, Math.floor((point.y - brushRadius) * pixelRatio));
      const diameter = Math.ceil(brushRadius * 2 * pixelRatio);
      const width = Math.min(diameter, canvas.width - x);
      const height = Math.min(diameter, canvas.height - y);

      if (width <= 0 || height <= 0) {
        continue;
      }

      try {
        // Get the image data for this region
        const imageData = ctx.getImageData(x, y, width, height);
        
        // Apply Gaussian blur to this region
        const blurredData = this.gaussianBlur(imageData, this.blurRadius);
        
        // Create a circular mask so only the brushed area is blurred
        this.applyCircularMask(
          blurredData,
          imageData,
          point.x * pixelRatio - x,
          point.y * pixelRatio - y,
          brushRadius * pixelRatio
        );
        
        // Put the blurred data back
        ctx.putImageData(blurredData, x, y);
      } catch (error) {
        // Ignore errors from getImageData (can happen at canvas edges)
        console.warn('Error applying blur:', error);
      }
    }
  }

  /**
   * Apply Gaussian blur to image data
   * This is a simple box blur approximation of Gaussian blur
   */
  private gaussianBlur(imageData: ImageData, radius: number): ImageData {
    const { width, height, data } = imageData;
    const output = new ImageData(width, height);
    
    // Use a simple box blur as an approximation of Gaussian blur
    // For better quality, we apply it multiple times
    const iterations = 3;
    
    let currentData = new Uint8ClampedArray(data);
    let tempData = new Uint8ClampedArray(data.length);
    
    for (let iter = 0; iter < iterations; iter += 1) {
      // Horizontal pass
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let r = 0, g = 0, b = 0, a = 0, count = 0;
          
          for (let kx = -radius; kx <= radius; kx += 1) {
            const px = x + kx;
            if (px >= 0 && px < width) {
              const idx = (y * width + px) * 4;
              r += currentData[idx];
              g += currentData[idx + 1];
              b += currentData[idx + 2];
              a += currentData[idx + 3];
              count += 1;
            }
          }
          
          const idx = (y * width + x) * 4;
          tempData[idx] = r / count;
          tempData[idx + 1] = g / count;
          tempData[idx + 2] = b / count;
          tempData[idx + 3] = a / count;
        }
      }
      
      // Vertical pass
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let r = 0, g = 0, b = 0, a = 0, count = 0;
          
          for (let ky = -radius; ky <= radius; ky += 1) {
            const py = y + ky;
            if (py >= 0 && py < height) {
              const idx = (py * width + x) * 4;
              r += tempData[idx];
              g += tempData[idx + 1];
              b += tempData[idx + 2];
              a += tempData[idx + 3];
              count += 1;
            }
          }
          
          const idx = (y * width + x) * 4;
          currentData[idx] = r / count;
          currentData[idx + 1] = g / count;
          currentData[idx + 2] = b / count;
          currentData[idx + 3] = a / count;
        }
      }
    }
    
    output.data.set(currentData);
    return output;
  }

  /**
   * Apply a circular mask to blend the blurred region with the original
   */
  private applyCircularMask(
    blurred: ImageData,
    original: ImageData,
    centerX: number,
    centerY: number,
    radius: number
  ): void {
    const { width, height } = blurred;
    
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        
        // Calculate distance from center
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Calculate alpha based on distance (feather the edges)
        let alpha = 1;
        if (distance > radius) {
          alpha = 0;
        } else if (distance > radius * 0.8) {
          // Soft edge falloff
          alpha = 1 - (distance - radius * 0.8) / (radius * 0.2);
        }
        
        // Blend blurred and original based on alpha
        blurred.data[idx] = blurred.data[idx] * alpha + original.data[idx] * (1 - alpha);
        blurred.data[idx + 1] = blurred.data[idx + 1] * alpha + original.data[idx + 1] * (1 - alpha);
        blurred.data[idx + 2] = blurred.data[idx + 2] * alpha + original.data[idx + 2] * (1 - alpha);
        // Keep original alpha
        blurred.data[idx + 3] = original.data[idx + 3];
      }
    }
  }
}
