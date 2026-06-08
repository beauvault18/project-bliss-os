import type { ReactNode } from 'react';
import { useWindowStore } from '../../core/windowStore';
import {
  usePreferencesStore,
  type AnimationSpeed,
  type ControlSide,
  type ParticleDensity,
  type ParticleSpeed,
} from '../../core/preferencesStore';
import { MINIMIZE_PRESETS } from '../../core/animationPresets';

// ---- small reusable controls -------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="lab__section">
      <h3 className="lab__heading">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="lab__row">
      <span className="lab__label">{label}</span>
      {children}
    </label>
  );
}

function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
  testid,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
  testid?: string;
}) {
  return (
    <span className="lab__slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testid}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="lab__value">
        {Math.round(value)}
        {suffix}
      </span>
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  testid,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  testid?: string;
}) {
  return (
    <button
      type="button"
      className={`lab__toggle${checked ? ' lab__toggle--on' : ''}`}
      data-testid={testid}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="lab__knob" />
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  testid,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  testid?: string;
}) {
  return (
    <span className="lab__segmented" data-testid={testid}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`lab__seg${value === o.value ? ' lab__seg--on' : ''}`}
          data-value={o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

const PRESET_OPTIONS = [
  { id: 'genie', label: 'Genie' },
  { id: 'somersault-token', label: 'Somersault Token' },
  { id: 'gravity', label: 'Gravity Drop' },
  { id: 'cube', label: 'Cube Flip' },
];

function PresetPicker({
  value,
  onChange,
  testid,
}: {
  value: string;
  onChange: (id: string) => void;
  testid?: string;
}) {
  return (
    <div className="lab__presets" data-testid={testid}>
      {PRESET_OPTIONS.map((p) => {
        const enabled = !!MINIMIZE_PRESETS[p.id];
        const active = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            disabled={!enabled}
            data-preset={p.id}
            className={`lab__preset${active ? ' lab__preset--on' : ''}${
              enabled ? '' : ' lab__preset--soon'
            }`}
            onClick={() => enabled && onChange(p.id)}
          >
            <span className="lab__preset-radio">{active ? '●' : '○'}</span>
            {p.label}
            {!enabled && <span className="lab__soon">soon</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---- the app ------------------------------------------------------------

export function BlissLabApp() {
  const p = usePreferencesStore();
  const update = usePreferencesStore((s) => s.update);
  const resetPrefs = usePreferencesStore((s) => s.reset);
  const resetLayout = useWindowStore((s) => s.resetLayout);

  return (
    <div className="lab" data-testid="bliss-lab">
      <div className="lab__hero">
        <span className="lab__hero-glyph">🧪</span>
        <div>
          <strong>Bliss Lab</strong>
          <div className="lab__hero-sub">Redesign the desktop — live.</div>
        </div>
      </div>

      <Section title="Animation Presets">
        <Row label="Minimize">
          <PresetPicker
            testid="lab-minimize-preset"
            value={p.minimizePreset}
            onChange={(id) => update({ minimizePreset: id })}
          />
        </Row>
        <Row label="Restore">
          <PresetPicker
            value={p.restorePreset}
            onChange={(id) => update({ restorePreset: id })}
          />
        </Row>
        <Row label="Speed">
          <Segmented<AnimationSpeed>
            testid="lab-speed"
            value={p.animationSpeed}
            options={[
              { value: 'slow', label: 'Slow' },
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: 'Fast' },
            ]}
            onChange={(v) => update({ animationSpeed: v })}
          />
        </Row>
        <Row label="Dramatic mode">
          <Toggle
            testid="lab-dramatic"
            checked={p.dramaticMode}
            onChange={(v) => update({ dramaticMode: v })}
          />
        </Row>
      </Section>

      <Section title="Window Behavior">
        <Row label="Wobble strength">
          <Slider
            testid="lab-wobble"
            value={p.wobbleStrength}
            min={0}
            max={100}
            onChange={(v) => update({ wobbleStrength: v })}
          />
        </Row>
        <Row label="Wobble speed">
          <Slider
            value={p.wobbleSpeed}
            min={0}
            max={100}
            onChange={(v) => update({ wobbleSpeed: v })}
          />
        </Row>
        <Row label="Snap strength">
          <Slider
            value={p.snapStrength}
            min={0}
            max={100}
            onChange={(v) => update({ snapStrength: v })}
          />
        </Row>
      </Section>

      <Section title="Desktop Feel">
        <Row label="Default opacity">
          <Slider
            testid="lab-default-opacity"
            value={Math.round(p.defaultOpacity * 100)}
            min={40}
            max={100}
            suffix="%"
            onChange={(v) => update({ defaultOpacity: v / 100 })}
          />
        </Row>
        <Row label="Glass mode">
          <Toggle
            testid="lab-glass"
            checked={p.glassMode}
            onChange={(v) => update({ glassMode: v })}
          />
        </Row>
      </Section>

      <Section title="Living Desktop">
        <Row label="Parallax desktop">
          <Toggle
            testid="lab-parallax"
            checked={p.parallaxEnabled}
            onChange={(v) => update({ parallaxEnabled: v })}
          />
        </Row>
        <Row label="Parallax strength">
          <Slider
            testid="lab-parallax-strength"
            value={p.parallaxStrength}
            min={0}
            max={100}
            onChange={(v) => update({ parallaxStrength: v })}
          />
        </Row>
        <Row label="Particle density">
          <Segmented<ParticleDensity>
            testid="lab-particle-density"
            value={p.particleDensity}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Med' },
              { value: 'high', label: 'High' },
            ]}
            onChange={(v) => update({ particleDensity: v })}
          />
        </Row>
        <Row label="Particle speed">
          <Segmented<ParticleSpeed>
            testid="lab-particle-speed"
            value={p.particleSpeed}
            options={[
              { value: 'slow', label: 'Slow' },
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: 'Fast' },
            ]}
            onChange={(v) => update({ particleSpeed: v })}
          />
        </Row>
        <Row label="Hacker mode">
          <Toggle
            testid="lab-hacker"
            checked={p.hackerMode}
            onChange={(v) => update({ hackerMode: v })}
          />
        </Row>
      </Section>

      <Section title="Controls">
        <Row label="Window control side">
          <Segmented<ControlSide>
            testid="lab-control-side"
            value={p.controlSide}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
            ]}
            onChange={(v) => update({ controlSide: v })}
          />
        </Row>
      </Section>

      <Section title="Debug / Demo Tools">
        <Row label="Fire close effects">
          <Toggle
            testid="lab-fire"
            checked={p.fireEffects}
            onChange={(v) => update({ fireEffects: v })}
          />
        </Row>
        <Row label="Show desktop icons">
          <Toggle
            testid="lab-show-icons"
            checked={p.showDesktopIcons}
            onChange={(v) => update({ showDesktopIcons: v })}
          />
        </Row>
        <Row label="Show taskbar dots">
          <Toggle
            checked={p.showTaskbarDots}
            onChange={(v) => update({ showTaskbarDots: v })}
          />
        </Row>
        <Row label="Show animation labels">
          <Toggle
            testid="lab-show-debug"
            checked={p.showAnimationDebug}
            onChange={(v) => update({ showAnimationDebug: v })}
          />
        </Row>
        <div className="lab__buttons">
          <button
            type="button"
            className="lab__btn"
            data-testid="lab-reset-layout"
            onClick={() => resetLayout()}
          >
            ⟳ Reset Demo Layout
          </button>
          <button type="button" className="lab__btn" onClick={() => resetPrefs()}>
            ↺ Reset All Settings
          </button>
        </div>
      </Section>
    </div>
  );
}
