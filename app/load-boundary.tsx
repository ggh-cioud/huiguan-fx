"use client";
import { Component, type ReactNode } from "react";

// A failed optional chunk must not unmount the already usable quote dashboard.
export class LoadBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
