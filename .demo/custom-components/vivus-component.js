import Vivus from 'https://esm.run/vivus';

class VivusComponentElement extends HTMLElement {
  static get observedAttributes() {
    return ['svg-file-path', 'animation-type', 'animation-speed', 'width', 'height', 'background-color', 'border', 'invert-colours'];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._container = document.createElement('div');
    this._shadow.appendChild(this._container);
  }

  connectedCallback() {
    console.log('VivusComponent v3.4 - Controls Overlay');
    this._render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
        this._render();
    }
  }

  _render() {
    this._container.innerHTML = '';
    // Ensure container styles are reset/clean
    this._container.removeAttribute('style');
    
    // Get attributes
    const width = this.getAttribute('width') || '100%';
    const height = this.getAttribute('height'); // Optional
    const border = this.getAttribute('border');
    const backgroundColor = this.getAttribute('background-color');
    const filePath = this.getAttribute('svg-file-path');
    const animationType = this.getAttribute('animation-type') || 'oneByOne';
    const animationSpeed = parseInt(this.getAttribute('animation-speed'), 10) || 200;
    const invertColours = this.getAttribute('invert-colours') === 'true';
    
    this.style.display = 'inline-block';
    this.style.boxSizing = 'border-box';
    this.style.width = width;
    this.style.height = height || 'auto'; // Default to auto height for aspect ratio preservation
        
    this.style.padding = '0';
    this.style.margin = '0';
    this.style.lineHeight = '0'; // Crucial: prevents font-size from adding bottom space
    this.style.verticalAlign = 'top'; // Align top to avoid baseline weirdness

    if (backgroundColor) this.style.backgroundColor = backgroundColor;
    if (border) this.style.border = border;

    // --- Styles ---
    const style = document.createElement('style');
    style.textContent = `
        .controls-overlay {
            position: absolute;
            bottom: 10px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 12px;
            background: rgba(0, 0, 0, 0.5); /* Semi-transparent black pill */
            padding: 8px 16px;
            border-radius: 30px;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
            z-index: 100;
            backdrop-filter: blur(4px);
        }
        .wrapper:hover .controls-overlay,
        .controls-overlay:hover { /* Ensure it stays visible when interacting */
            opacity: 1;
            pointer-events: auto;
        }
        .control-btn {
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.9);
            cursor: pointer;
            width: 24px;
            height: 24px;
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
            width: 20px;
            height: 20px;
            fill: currentColor;
            display: block;
        }
    `;
    this._container.appendChild(style);
    
    // This div ensures that any crazy SVG drawing artifacts are clipped
    const clipContainer = document.createElement('div');
    clipContainer.className = 'wrapper';
    clipContainer.style.width = '100%';
    clipContainer.style.height = '100%';
    clipContainer.style.overflow = 'hidden';
    clipContainer.style.display = 'flex';
    clipContainer.style.alignItems = 'center';
    clipContainer.style.justifyContent = 'center';
    clipContainer.style.position = 'relative';
    this._container.appendChild(clipContainer);

    const vivusWrapper = document.createElement('div');
    // Ensure the wrapper fills the clip container but lets SVG dictate height
    vivusWrapper.style.width = '100%'; 
    vivusWrapper.style.height = 'auto';
    vivusWrapper.style.display = 'block';
    clipContainer.appendChild(vivusWrapper);

    // --- Controls ---
    const controls = document.createElement('div');
    controls.className = 'controls-overlay';
    
    // Icons (Material Design style)
    const iconStart = `<svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>`; // Skip Previous
    const iconPause = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    const iconPlay  = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    const iconEnd   = `<svg viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>`; // Skip Next

    // Start Button
    const btnStart = document.createElement('button');
    btnStart.className = 'control-btn';
    btnStart.innerHTML = iconStart;
    btnStart.title = 'Go to Start';
    
    // Play/Pause Button
    const btnPlayPause = document.createElement('button');
    btnPlayPause.className = 'control-btn';
    btnPlayPause.innerHTML = iconPause; // Default is playing
    btnPlayPause.title = 'Pause';

    // End Button
    const btnEnd = document.createElement('button');
    btnEnd.className = 'control-btn';
    btnEnd.innerHTML = iconEnd;
    btnEnd.title = 'Go to End';

    controls.appendChild(btnStart);
    controls.appendChild(btnPlayPause);
    controls.appendChild(btnEnd);
    clipContainer.appendChild(controls);

    // Vivus Instance holder
    let myVivusInstance = null;
    let isPlaying = true;

    const updatePlayButton = () => {
        btnPlayPause.innerHTML = isPlaying ? iconPause : iconPlay;
        btnPlayPause.title = isPlaying ? 'Pause' : 'Resume';
    };

    // Event Listeners
    btnStart.onclick = (e) => {
        e.stopPropagation(); // prevent clicking through to slide nav if any
        if (myVivusInstance) {
            myVivusInstance.reset();
            myVivusInstance.stop(); // Go to start usually implies stopping there? Or replaying?
            // "Go to start" -> reset() moves to frame 0.
            // If we want it to just sit there, we stop.
            isPlaying = false;
            updatePlayButton();
        }
    };

    btnEnd.onclick = (e) => {
        e.stopPropagation();
        if (myVivusInstance) {
            myVivusInstance.finish(); // Draws defined final state
            isPlaying = false; // It's finished
            updatePlayButton();
        }
    };

    btnPlayPause.onclick = (e) => {
        e.stopPropagation();
        if (myVivusInstance) {
            if (isPlaying) {
                myVivusInstance.stop();
                isPlaying = false;
            } else {
                // If we are at the end, reset and play
                if (myVivusInstance.getStatus() === 'end') {
                    myVivusInstance.reset();
                    myVivusInstance.play();
                } else {
                    myVivusInstance.play();
                }
                isPlaying = true;
            }
            updatePlayButton();
        }
    };

    if (filePath) {
        try {
            new Vivus(vivusWrapper, {
                type: animationType,
                duration: animationSpeed,
                file: filePath,
                onReady: (myVivus) => {
                    // Capture instance
                    myVivusInstance = myVivus;
                    
                    if (!vivusWrapper.isConnected) return;
                    
                    if (myVivus.el) {
                        // Standard Responsive SVG Styles
                        myVivus.el.style.display = 'block';
                        myVivus.el.style.width = '100%';
                        myVivus.el.style.height = 'auto';
                        
                        // Apply color inversion if requested
                        if (invertColours) {
                            // Manual RGB inversion. We avoid CSS filter:invert(100%) because it conflicts with manual overrides
                            // and can cause double-negatives or rendering artifacts.
                            const paths = myVivus.el.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse, g');
                            
                            paths.forEach(path => {
                                const style = window.getComputedStyle(path);
                                const stroke = style.stroke; 
                                
                                // Skip if no stroke or transparent
                                if (!stroke || stroke === 'none' || stroke === 'transparent') {
                                    return;
                                }

                                // Parse "rgb(r, g, b)" which getComputedStyle standardizes to
                                const rgbMatch = stroke.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                                if (rgbMatch) {
                                    const r = parseInt(rgbMatch[1], 10);
                                    const g = parseInt(rgbMatch[2], 10);
                                    const b = parseInt(rgbMatch[3], 10);
                                    
                                    // Check if the color is grayscale (or very close to it)
                                    // We basically want to invert only black, gray, white structure lines,
                                    // but keep colored lines (like blue, red) as they are.
                                    const maxDiff = Math.max(r, g, b) - Math.min(r, g, b);
                                    
                                    // Threshold of 30 handles slight compression artifacts or non-web-safe grays
                                    const isGrayscale = maxDiff < 30;

                                    if (isGrayscale) {
                                        // Invert: 255 - value
                                        path.style.stroke = `rgb(${255 - r}, ${255 - g}, ${255 - b})`;
                                    }
                                }
                            });
                        }

                        // Remove hardcoded dimensions to let viewBox take over
                        myVivus.el.removeAttribute('width');
                        myVivus.el.removeAttribute('height');
                    }
                    myVivus.play(myVivus.getStatus() === 'end' ? -1 : 1);
                }
            });
        } catch (e) {
            console.error('Vivus initialization failed', e);
            vivusWrapper.innerText = 'Error loading SVG';
        }
    }
  }
}

if (!customElements.get('vivus-component')) {
  customElements.define('vivus-component', VivusComponentElement);
}
