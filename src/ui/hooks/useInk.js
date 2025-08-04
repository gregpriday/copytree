import { useState, useEffect } from 'react';

let inkComponents = null;
let isLoading = false;
let loadPromise = null;

const useInk = () => {
  const [components, setComponents] = useState(inkComponents);
  const [loading, setLoading] = useState(!inkComponents);

  useEffect(() => {
    if (inkComponents) {
      setComponents(inkComponents);
      setLoading(false);
      return;
    }

    if (!loadPromise) {
      isLoading = true;
      loadPromise = import('ink').then((ink) => {
        inkComponents = {
          Box: ink.Box,
          Text: ink.Text,
          Newline: ink.Newline,
          Spinner: ink.Spinner
        };
        isLoading = false;
        return inkComponents;
      }).catch((error) => {
        console.error('Failed to load Ink components:', error);
        inkComponents = {};
        isLoading = false;
        return inkComponents;
      });
    }

    loadPromise.then((components) => {
      setComponents(components);
      setLoading(false);
    });
  }, []);

  return { components, loading };
};

export default useInk;