/**
 * A video component
 */
export class VideoComponent {
  static properties = {
    src: { type: String }
  };

  constructor() {
    this.src = 'https://file+.vscode-resource.vscode-cdn.net/d%3A/git/demoTimeTest/.demo/assets/complex-scenario.mp4';
  }

  render() {
    return html`
      <video id="myVideo" width="100%" height="100%" controls autoplay muted>
        <source src=${this.src} type="video/mp4">
        Your browser does not support HTML5 video.
      </video> 
    `;
  }
}

customElements.define('video-component', VideoComponent);


   