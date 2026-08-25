import { useState, useEffect } from 'react';
import { ThemeType } from '../lib/appearance';
import { 
  AppLayoutConfig, 
  DEFAULT_LAYOUT_CONFIG, 
  getSavedLayout, 
  saveLayout, 
  resetLayout, 
  isLayoutEditMode, 
  setLayoutEditMode,
  getIntelligentLayout
} from '../lib/layoutStore';

export function useLayout() {
  const [layout, setLayout] = useState<AppLayoutConfig>(getSavedLayout);
  const [editMode, setEditMode] = useState<boolean>(isLayoutEditMode);
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  useEffect(() => {
    // Handle window resize for dynamic calculations
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    
    // Subscribe to layout changes
    const handleLayoutChange = (e: Event) => {
      const customEvent = e as CustomEvent<AppLayoutConfig>;
      if (customEvent.detail) {
        setLayout(customEvent.detail);
      }
    };

    // Subscribe to edit mode changes
    const handleEditModeChange = (e: Event) => {
      const customEvent = e as CustomEvent<boolean>;
      if (customEvent.detail !== undefined) {
        setEditMode(customEvent.detail);
      }
    };

    window.addEventListener('babel_layout_changed', handleLayoutChange);
    window.addEventListener('babel_layout_edit_mode_changed', handleEditModeChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('babel_layout_changed', handleLayoutChange);
      window.removeEventListener('babel_layout_edit_mode_changed', handleEditModeChange);
    };
  }, []);

  const toggleEditMode = () => {
    const nextMode = !editMode;
    setEditMode(nextMode);
    setLayoutEditMode(nextMode);
  };

  const updatePanel = (
    viewKey: keyof AppLayoutConfig, 
    panelKey: string, 
    updates: Partial<{ show: boolean; widthPercent: number; heightPx: number; theme: ThemeType | undefined }>
  ) => {
    const newLayout = { ...layout };
    const viewConfig = { ...newLayout[viewKey] };
    if (viewConfig && viewConfig[panelKey]) {
      viewConfig[panelKey] = {
        ...viewConfig[panelKey],
        ...updates
      };
      // Ensure widths are bounded between 10% and 100%
      if (viewConfig[panelKey].widthPercent !== undefined) {
        viewConfig[panelKey].widthPercent = Math.max(10, Math.min(100, viewConfig[panelKey].widthPercent));
      }
      // Ensure heights are reasonable (e.g. 50px to 1200px)
      if (viewConfig[panelKey].heightPx !== undefined) {
        viewConfig[panelKey].heightPx = Math.max(50, Math.min(1200, viewConfig[panelKey].heightPx));
      }
      newLayout[viewKey] = viewConfig as any;
      setLayout(newLayout);
      saveLayout(newLayout);
    }
  };

  const applyIntelligentLayout = () => {
    const optimized = getIntelligentLayout(windowSize.width, windowSize.height);
    setLayout(optimized);
    saveLayout(optimized);
  };

  const resetToDefault = () => {
    setLayout(DEFAULT_LAYOUT_CONFIG);
    resetLayout();
  };

  return {
    layout,
    editMode,
    windowSize,
    toggleEditMode,
    updatePanel,
    applyIntelligentLayout,
    resetToDefault
  };
}
