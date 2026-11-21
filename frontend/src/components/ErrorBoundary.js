import React from "react";
import ErrorPage from "@/pages/ErrorPage";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Sharago boundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return <ErrorPage error={this.state.error} reset={() => this.setState({ hasError: false, error: null })} />;
    }
    return this.props.children;
  }
}
