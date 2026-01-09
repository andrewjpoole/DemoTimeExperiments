
class AnimateSvgComponentElement extends HTMLElement {
  static get observedAttributes() {
    return ['svg-file-path', 'animation-speed', 'width', 'height', 'background-color', 'border', 'invert-colors', 'auto-play'];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._container = document.createElement('div');
    this._shadow.appendChild(this._container);
    
    // Animation state
    this._paths = [];
    this._totalLength = 0;
    this._animationFrameId = null;
    this._startTime = null;
    this._pausedTime = null;
    this._elapsedBeforePause = 0;
    this._isPlaying = false;
    this._isFinished = false;
    this._duration = 2000;
    this._pauseProgress = 1; // Default to play to end
    this._pauseAtPathIndex = undefined; // Index of path to pause after
    this._pausePoints = []; // Array of {progress, type, duration}
    this._currentPauseIndex = 0; // Which pause point we're currently at
    this._svgText = null; // Store SVG text for pause calculation
    this._updatePlayButton = null; // Function to update play/pause button
  }

  connectedCallback() {
    console.log('AnimateSvgComponent - Connected to DOM');
    this._render();
  }

  disconnectedCallback() {
      this._cancelAnimation();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
        this._render();
    }
  }

  _cancelAnimation() {
      if (this._animationFrameId) {
          cancelAnimationFrame(this._animationFrameId);
          this._animationFrameId = null;
      }
  }

  _render() {
    this._cancelAnimation();
    this._container.innerHTML = '';
    this._container.removeAttribute('style');
    
    // Get attributes
    const width = this.getAttribute('width') || '100%';
    const height = this.getAttribute('height'); 
    const border = this.getAttribute('border');
    const backgroundColor = this.getAttribute('background-color');
    const filePath = this.getAttribute('svg-file-path');
    
    // Interpret speed. Vivus uses frames (~16ms). If valid provided < 1000, treat as frames. Else ms.
    const speedAttr = parseInt(this.getAttribute('animation-speed'), 10);
    if (!isNaN(speedAttr)) {
        this._duration = speedAttr < 1000 ? speedAttr * 16.66 : speedAttr;
    } else {
        this._duration = 2000;
    }

    const invertColors = this.getAttribute('invert-colors') === 'true';
    const autoPlay = this.getAttribute('auto-play') !== 'false'; 
    
    this.style.display = 'inline-block';
    this.style.boxSizing = 'border-box';
    this.style.width = width;
    this.style.height = height || 'auto'; 
        
    this.style.padding = '0';
    this.style.margin = '0';
    this.style.lineHeight = '0'; 
    this.style.verticalAlign = 'top'; 

    if (backgroundColor) this.style.backgroundColor = backgroundColor;
    if (border) this.style.border = border;

    // --- Styles (Copied and adapted from VivusComponent) ---
    const style = document.createElement('style');
    style.textContent = `
        .controls-overlay {
            position: absolute;
            bottom: 10px;
            right: 10px;
            display: flex;
            gap: 10px;
            background: rgba(0, 0, 0, 0.5);
            padding: 6px 12px;
            border-radius: 20px;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
            z-index: 100;
            backdrop-filter: blur(4px);
        }
        .wrapper:hover .controls-overlay,
        .controls-overlay:hover,
        .controls-overlay.force-visible {
            opacity: 1;
            pointer-events: auto;
        }
        .control-btn {
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.9);
            cursor: pointer;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            transition: transform 0.1s, color 0.2s;
        }
        .control-btn:hover {
            transform: scale(1.1);
            color: #fff;
        }
        .control-btn:active {
            transform: scale(0.95);
        }
        .control-btn svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
            display: block;
        }
        
        /* Animation-specific styles */
        .svg-content path, .svg-content line, .svg-content polyline, 
        .svg-content polygon, .svg-content rect, .svg-content circle, .svg-content ellipse { 
            stroke-linecap: round;
            stroke-linejoin: round;
            /* Will be set by JS, but good default */
            fill-opacity: 0; 
            transition: fill-opacity 0.5s ease;
        }
        .svg-content.finished path, .svg-content.finished line, .svg-content.finished polyline, 
        .svg-content.finished polygon, .svg-content.finished rect, .svg-content.finished circle, .svg-content.finished ellipse {
            fill-opacity: 1;
        }
    `;
    this._container.appendChild(style);
    
    // Wrapper
    const clipContainer = document.createElement('div');
    clipContainer.className = 'wrapper';
    clipContainer.style.width = '100%';
    clipContainer.style.height = '100%';
    clipContainer.style.position = 'relative';
    this._container.appendChild(clipContainer);

    const svgWrapper = document.createElement('div');
    svgWrapper.style.width = '100%'; 
    svgWrapper.style.height = 'auto';
    svgWrapper.style.display = 'block';
    svgWrapper.className = 'svg-content';
    clipContainer.appendChild(svgWrapper);

    if (filePath) {
        fetch(filePath)
            .then(res => {
                return res.text();
            })
            .then(svgText => {                 let shouldAutoPlay = autoPlay;
                 
                 // Check for pause comment in SVG
                 let pauseElement = null;
                 // Check for pause comments in SVG - find all of them
                 const pauseComments = [];
                 
                 // Find all manual pauses
                 let manualMatch;
                 const manualRegex = /<!--Pause:UntilPlay-->/g;
                 while ((manualMatch = manualRegex.exec(svgText)) !== null) {
                     pauseComments.push({
                         index: manualMatch.index,
                         type: 'manual',
                         duration: 0
                     });
                 }
                 
                 // Find all timed pauses
                 let timedMatch;
                 const timedRegex = /<!--Pause:(\d+)-->/g;
                 while ((timedMatch = timedRegex.exec(svgText)) !== null) {
                     pauseComments.push({
                         index: timedMatch.index,
                         type: 'timed',
                         duration: parseFloat(timedMatch[1]) * 1000
                     });
                 }
                 
                 // Sort by position in SVG
                 pauseComments.sort((a, b) => a.index - b.index);
                 
                 if (pauseComments.length > 0) {
                     shouldAutoPlay = true;
                     this._pauseComments = pauseComments;
                     this._svgText = svgText; // Store for later use
                 }
                 this._isPlaying = shouldAutoPlay;
                                  // Basic sanitization/parse
                 const parser = new DOMParser();
                 const doc = parser.parseFromString(svgText, "image/svg+xml");
                 const svgEl = doc.querySelector('svg');
                 if (svgEl) {
                     // Calculate pause points if comments exist
                     if (this._pauseComments && this._pauseComments.length > 0) {
                         // We'll calculate the progress values after the SVG is parsed and paths are measured
                         // For now, just store the comment indices
                     }
                     svgWrapper.innerHTML = '';
                     
                     // Responsive styles
                     svgEl.style.width = '100%';
                     svgEl.style.height = 'auto';
                     svgEl.removeAttribute('width');
                     svgEl.removeAttribute('height');
                     
                     // Ensure SVG has viewBox for rendering
                     if (!svgEl.getAttribute('viewBox')) {
                         // Try to infer viewBox from width/height or set default
                         const w = svgEl.getAttribute('width') || 100;
                         const h = svgEl.getAttribute('height') || 100;
                         svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
                     }
                     
                     svgWrapper.appendChild(svgEl);
                     
                     // Force layout by accessing offsetWidth
                     svgEl.offsetWidth; // Trigger layout
                     
                     // --- Controls ---
                     const controls = document.createElement('div');
                     controls.className = 'controls-overlay';
                     if (!shouldAutoPlay) {
                         controls.classList.add('force-visible');
                     }
                     
                     const iconStart = `<svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>`;
                     const iconPause = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
                     const iconPlay  = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
                     const iconEnd   = `<svg viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>`;

                     const btnStart = document.createElement('button');
                     btnStart.className = 'control-btn';
                     btnStart.innerHTML = iconStart;
                     btnStart.title = 'Start';
                     
                     const btnPlayPause = document.createElement('button');
                     btnPlayPause.className = 'control-btn';
                     btnPlayPause.innerHTML = shouldAutoPlay ? iconPause : iconPlay; 
                     btnPlayPause.title = shouldAutoPlay ? 'Pause' : 'Play';

                     const btnEnd = document.createElement('button');
                     btnEnd.className = 'control-btn';
                     btnEnd.innerHTML = iconEnd;
                     btnEnd.title = 'End';

                     controls.appendChild(btnStart);
                     controls.appendChild(btnPlayPause);
                     controls.appendChild(btnEnd);
                     clipContainer.appendChild(controls);

                     // Control Logic
                     this._isFinished = false;

                     const updatePlayButton = () => {
                         btnPlayPause.innerHTML = this._isPlaying ? iconPause : iconPlay;
                         btnPlayPause.title = this._isPlaying ? 'Pause' : 'Resume';
                     };
                     
                     // Store reference for automatic pause updates
                     this._updatePlayButton = updatePlayButton;

                     btnStart.onclick = (e) => {
                         e.stopPropagation();
                         this._reset();
                         this._isPlaying = false;
                         updatePlayButton();
                     };

                     btnEnd.onclick = (e) => {
                         e.stopPropagation();
                         this._finish();
                         this._isPlaying = false;
                         updatePlayButton();
                     };

                     btnPlayPause.onclick = (e) => {
                         e.stopPropagation();
                         controls.classList.remove('force-visible'); // Hide permanent overlay on first interaction
                         if (this._isPlaying) {
                             this._pause();
                         } else {
                             if (this._isFinished) {
                                 this._reset();
                             } else {
                                 // If we're resuming from a manual pause, increment the pause index
                                 if (this._pausePoints && this._currentPauseIndex < this._pausePoints.length) {
                                     const currentPause = this._pausePoints[this._currentPauseIndex];
                                     if (currentPause.type === 'manual') {
                                         this._currentPauseIndex++;
                                     }
                                 }
                             }
                             this._play();
                         }
                         updatePlayButton();
                     };
                     
                     // Defer setup to next frame to ensure rendering
                     requestAnimationFrame(() => {
                         try {
                             this._setupPaths(svgEl);
                             
                             if (invertColors) {
                                 this._applyInvertColours(svgEl);
                             }
                             
                             if (this._isPlaying) {
                                 this._play();
                             } else {
                                 this._draw(0);
                             }
                         } catch (e) {
                             // If still fails, wait for visibility
                             this._waitForVisibility(svgEl, invertColors);
                         }
                     });
                 }
            })
            .catch(err => {
                console.error('Failed to load SVG', err);
                svgWrapper.innerText = 'Error loading SVG';
            });
    }
  }

  _waitForVisibility(svgEl, invertColors) {
      const maxRetries = 20;
      let retryCount = 0;
      
      const trySetup = () => {
          try {
              this._setupPaths(svgEl);
              
              if (invertColors) {
                  this._applyInvertColours(svgEl);
              }
              
              if (this._isPlaying) {
                  this._play();
              } else {
                  this._draw(0);
              }
              return true;
          } catch (e) {
              retryCount++;
              if (retryCount < maxRetries) {
                  requestAnimationFrame(trySetup); // Retry on next frame
              } else {
                  console.warn('AnimateSvgComponent: Unable to measure paths after multiple retries.', e);
              }
              return false;
          }
      };
      
      // Start trying immediately
      requestAnimationFrame(trySetup);
  }

  _applyInvertColours(svgEl) {
    const elements = svgEl.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse, g');
    elements.forEach(el => {
        const style = window.getComputedStyle(el);
        
        // Invert stroke
        const stroke = style.stroke; 
        if (stroke && stroke !== 'none' && stroke !== 'transparent') {
            this._invertColorIfGrayscale(el, 'stroke', stroke);
        }
        
        // Invert fill
        const fill = style.fill;
        if (fill && fill !== 'none' && fill !== 'transparent') {
            this._invertColorIfGrayscale(el, 'fill', fill);
        }
    });
  }
  
  _invertColorIfGrayscale(el, property, color) {
      const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
          const r = parseInt(rgbMatch[1], 10);
          const g = parseInt(rgbMatch[2], 10);
          const b = parseInt(rgbMatch[3], 10);
          
          const maxDiff = Math.max(r, g, b) - Math.min(r, g, b);
          
          // Threshold of 30 handles slight compression artifacts or non-web-safe grays
          const isGrayscale = maxDiff < 30;

          if (isGrayscale) {
              el.style[property] = `rgb(${255 - r}, ${255 - g}, ${255 - b})`;
          }
      }
  }

  _setupPaths(svgEl) {
      // Ensure the SVG has dimensions before measuring
      if (svgEl.offsetWidth === 0 || svgEl.offsetHeight === 0) {
          // Force dimensions if needed
          if (svgEl.offsetWidth === 0) {
              svgEl.style.width = '1px';
          }
          if (svgEl.offsetHeight === 0) {
              svgEl.style.height = '1px';
          }
          // Trigger reflow
          svgEl.offsetWidth;
          
          // If still zero, throw
          if (svgEl.offsetWidth === 0 || svgEl.offsetHeight === 0) {
              throw new Error('SVG not rendered yet');
          }
      }
      
      // Find all drawable elements
      const selector = 'path, line, polyline, polygon, rect, circle, ellipse';
      const elements = Array.from(svgEl.querySelectorAll(selector));
      
      const newPaths = [];
      let newTotalLength = 0;
      let pauseAtLength = -1; // Length up to which to pause

      // Calculate first, apply later (transactional)
      // This ensures if getTotalLength throws (hidden element), we don't leave partial state
      let currentPathIndex = 0;
      for (const el of elements) {
          if (typeof el.getTotalLength === 'function') {
              let len = 0;
              try {
                  len = el.getTotalLength();
              } catch (e) {
                  // Element not rendered, skip or set to 0
                  continue;
              }
              if (len > 0) { // Skip zero-length paths
                  newPaths.push({
                      el: el,
                      length: len,
                      startAt: newTotalLength,
                      endAt: newTotalLength + len
                  });
                  
                  // Check if this is the pause path index
                  if (this._pauseAtPathIndex !== undefined && currentPathIndex === this._pauseAtPathIndex) {
                      pauseAtLength = newTotalLength + len; // Pause after this path
                  }
                  
                  newTotalLength += len;
                  currentPathIndex++;
              }
          }
      }

      // Calculate pause progress
      let pauseProgress = 1;
      if (pauseAtLength >= 0 && newTotalLength > 0) {
          pauseProgress = pauseAtLength / newTotalLength;
      }

      // Calculate progress for all pause points
      if (this._pauseComments && this._pauseComments.length > 0 && this._svgText) {
          this._pausePoints = [];

          // Find all drawable elements in the SVG text in order
          const drawableRegex = /<(path|line|polyline|polygon|rect|circle|ellipse)(\s[^>]*)?>/g;
          const drawableElements = [];
          let match;
          while ((match = drawableRegex.exec(this._svgText)) !== null) {
              drawableElements.push({
                  tag: match[1],
                  index: match.index,
                  fullMatch: match[0]
              });
          }

          // For each pause comment, find where it falls in the drawable elements
          for (const comment of this._pauseComments) {
              let pathsBeforeComment = 0;
              let commentProgress = 0;

              // Count how many drawable elements come before this comment
              for (let i = 0; i < drawableElements.length; i++) {
                  if (drawableElements[i].index < comment.index) {
                      pathsBeforeComment++;
                  } else {
                      break;
                  }
              }

              // Calculate progress based on the cumulative length up to this point
              if (newPaths.length > 0) {
                  if (pathsBeforeComment === 0) {
                      commentProgress = 0; // Pause at start
                  } else if (pathsBeforeComment >= newPaths.length) {
                      commentProgress = 1; // Pause at end
                  } else {
                      // Pause after the Nth path
                      const targetPath = newPaths[pathsBeforeComment - 1];
                      commentProgress = targetPath.endAt / newTotalLength;
                  }
              }

              this._pausePoints.push({
                  progress: Math.max(0, Math.min(1, commentProgress)), // Clamp between 0 and 1
                  type: comment.type === 'manual' ? 'manual' : 'timed',
                  duration: comment.duration
              });
          }

          console.log('Calculated pause points:', this._pausePoints);
      }

      // Success
      this._paths = newPaths;
      this._totalLength = newTotalLength;
      this._pauseProgress = pauseProgress;

      console.log('AnimateSvgComponent - Setup complete:', {
        pathsFound: newPaths.length,
        totalLength: newTotalLength,
        pausePoints: this._pausePoints?.length || 0
      });

      // Apply styles
      this._paths.forEach(p => {
            p.el.style.strokeDasharray = `${p.length} ${p.length}`;
            p.el.style.strokeDashoffset = p.length;
      });
  }

  _play() {
      if (this._isPlaying && this._animationFrameId) return; // Already running
      this._isPlaying = true;
      this._isFinished = false;
      this._startTime = performance.now();
      
      // If we were paused, adjust start time to account for elapsed
      if (this._elapsedBeforePause > 0) {
          this._startTime -= this._elapsedBeforePause;
      }
      
      this.shadowRoot.querySelector('.svg-content').classList.remove('finished');

      const animate = (time) => {
          if (!this._isPlaying) return;
          
          const elapsed = time - this._startTime;
          
          if (elapsed >= this._duration) {
              this._finish();
              return;
          }
          
          const progress = elapsed / this._duration;
          
          // Check for current pause point
          if (this._pausePoints && this._currentPauseIndex < this._pausePoints.length) {
              const currentPause = this._pausePoints[this._currentPauseIndex];
              if (progress >= currentPause.progress) {
                  if (currentPause.type === 'timed') {
                      // Timed pause: pause and then resume automatically
                      this._pause();
                      setTimeout(() => {
                          this._currentPauseIndex++;
                          this._play();
                      }, currentPause.duration);
                  } else {
                      // Manual pause: pause and wait for user interaction
                      this._pause();
                      // Don't increment _currentPauseIndex here - wait for user to resume
                  }
                  return;
              }
          }
          
          this._draw(progress);
          
          this._animationFrameId = requestAnimationFrame(animate);
      };
      
      this._animationFrameId = requestAnimationFrame(animate);
  }

  _pause() {
      this._isPlaying = false;
      if (this._animationFrameId) {
          cancelAnimationFrame(this._animationFrameId);
          this._animationFrameId = null;
      }
      // Calculate how much time had passed so we can resume later
      // We need to approximate where we were based on current time
      // _startTime was set when _play started. 
      // Current elapsed = performance.now() - _startTime
      this._elapsedBeforePause = performance.now() - this._startTime;
      
      // Update button to show resume/play
      if (this._updatePlayButton) {
          this._updatePlayButton();
      }
  }

  _reset() {
      this._pause();
      this._elapsedBeforePause = 0;
      this._currentPauseIndex = 0; // Reset pause index for multiple pauses
      this._draw(0);
      this._isFinished = false;
      this.shadowRoot.querySelector('.svg-content').classList.remove('finished');
  }

  _finish() {
      this._pause();
      this._draw(1);
      this._isFinished = true;
      // Show fills
      this.shadowRoot.querySelector('.svg-content').classList.add('finished');
      // Reset elapsed so if we play again it restarts or we can handle it in play logic
      this._elapsedBeforePause = this._duration;
      // Update UI to show "Restart" or "Pause" state? 
      // Usually finish means we are done.
  }

  _draw(progress) {
      // progress is 0 to 1
      const currentLength = this._totalLength * progress;
      
      this._paths.forEach(p => {
          if (currentLength >= p.endAt) {
              // Path fully drawn
              p.el.style.strokeDashoffset = 0;
          } else if (currentLength <= p.startAt) {
              // Path not started
              p.el.style.strokeDashoffset = p.length;
          } else {
              // Path in progress
              // Calculate how much of THIS path is drawn
              const drawnPartOfPath = currentLength - p.startAt;
              const offset = p.length - drawnPartOfPath;
              p.el.style.strokeDashoffset = offset;
          }
      });
  }
}

if (!customElements.get('animate-svg-component')) {
  customElements.define('animate-svg-component', AnimateSvgComponentElement);
}
