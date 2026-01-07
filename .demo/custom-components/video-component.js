/**
 * Expose a native custom element named `video-component`
 */
const defaultSrc = 'https://file+.vscode-resource.vscode-cdn.net/d%3A/git/demoTimeTest/.demo/assets/complex-scenario.mp4';

class VideoComponentElement extends HTMLElement {
  static get observedAttributes() {
    return ['src', 'playback-rate', 'playbackrate', 'auto-play', 'autoplay', 'muted'];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._video = document.createElement('video');
    this._video.controls = true;
    this._video.style.width = '100%';
    this._video.style.height = '100%';
    this._onLoaded = () => this._applyPlaybackRate();
  }

  connectedCallback() {
    this._upgradeProperty('src');
    this._upgradeProperty('playbackRate');
    this._upgradeProperty('autoPlay');
    this._upgradeProperty('muted');

    this._renderVideo();
    this._applyPlaybackRate();
    this._video.addEventListener('loadedmetadata', this._onLoaded);
  }

  disconnectedCallback() {
    this._video.removeEventListener('loadedmetadata', this._onLoaded);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    switch (name) {
      case 'src':
        this._video.querySelectorAll('source').forEach(s => s.remove());
        const src = newValue || defaultSrc;
        const source = document.createElement('source');
        source.src = src;
        source.type = 'video/mp4';
        this._video.appendChild(source);
        // try to load the new source
        try { this._video.load(); } catch (e) { /* ignore */ }
        break;
      case 'playback-rate':
      case 'playbackrate':
        this._applyPlaybackRate();
        break;
      case 'auto-play':
      case 'autoplay':
        this._video.autoplay = this.hasAttribute('auto-play') || this.hasAttribute('autoplay');
        break;
      case 'muted':
        this._video.muted = this.hasAttribute('muted');
        break;
    }
  }

  _upgradeProperty(prop) {
    if (this.hasOwnProperty(prop)) {
      let value = this[prop];
      delete this[prop];
      this[prop] = value;
    }
  }

  _renderVideo() {
    // Ensure a single <video> element in shadow root
    this._shadow.innerHTML = '';
    // source
    const src = this.getAttribute('src') || defaultSrc;
    const source = document.createElement('source');
    source.src = src;
    source.type = 'video/mp4';
    this._video.appendChild(source);

    // autoplay / muted
    this._video.autoplay = this.hasAttribute('auto-play') || this.hasAttribute('autoplay');
    this._video.muted = this.hasAttribute('muted');

    this._shadow.appendChild(this._video);
  }

  _applyPlaybackRate() {
    const attr = this.getAttribute('playback-rate') || this.getAttribute('playbackrate');
    const rate = attr ? Number(attr) : 1.0;
    try {
      this._video.playbackRate = rate || 1.0;
    } catch (e) {
      // ignore
    }
  }
}

if (!customElements.get('video-component')) {
  customElements.define('video-component', VideoComponentElement);
}


   