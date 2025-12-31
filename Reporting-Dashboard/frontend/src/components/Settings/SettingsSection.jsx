import { useEffect, useRef } from 'react';
import { useSettings } from './SettingsLayout';

const SettingsSection = ({ id, children, className = '' }) => {
  const { registerSection, isInteractingRef } = useSettings();
  const sectionRef = useRef(null);

  useEffect(() => {
    if (sectionRef.current) {
      registerSection(id, sectionRef.current);
    }
  }, [id, registerSection]);

  return (
    <section
      ref={sectionRef}
      id={id}
      className={`scroll-mt-20 mb-12 ${className}`}
      onMouseDown={() => (isInteractingRef.current = true)}
      onMouseUp={() => (isInteractingRef.current = false)}
      onMouseLeave={() => (isInteractingRef.current = false)}
    >
      {children}
    </section>
  );
};

export default SettingsSection;
