import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, message: err?.message || String(err) };
  }
  componentDidCatch(err, info) {
    console.error('[ErrorBoundary]', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h2>Ocurrió un error en la aplicación</h2>
          <p style={{ color: '#b00' }}>{this.state.message}</p>
          <p>Intenta recargar la página o volver al inicio.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
