import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Error capturado:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleVolver = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleRecargar = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-container">
          <div className="error-boundary-card">
            <div className="error-boundary-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            
            <h3 className="error-boundary-title">Ocurrió un error en la interfaz</h3>
            <p className="error-boundary-desc">
              No te preocupes, tus datos guardados no se han perdido. Puedes volver a la pantalla de inicio o recargar la aplicación.
            </p>

            {this.state.error && (
              <div className="error-boundary-details">
                <code>{this.state.error.toString()}</code>
              </div>
            )}

            <div className="error-boundary-actions">
              <button 
                type="button" 
                className="btn-error-primary" 
                onClick={this.handleVolver}
              >
                Volver al Inicio
              </button>
              <button 
                type="button" 
                className="btn-error-secondary" 
                onClick={this.handleRecargar}
              >
                Recargar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
