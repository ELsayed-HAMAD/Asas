import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function TopBarActions({ children }) {
  const [mounted, setMounted] = useState(false);
  const [portalNode, setPortalNode] = useState(null);

  useEffect(() => {
    setMounted(true);
    const node = document.getElementById('topbar-actions-portal');
    if (node) {
      setPortalNode(node);
    }
  }, []);

  if (!mounted || !portalNode) return null;

  return createPortal(children, portalNode);
}
