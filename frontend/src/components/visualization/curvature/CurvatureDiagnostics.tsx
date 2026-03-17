import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import './CurvatureDiagnostics.css';

interface CalculationStep {
  description: string;
  formula: string;
  calculation?: string;
  result: string;
  values?: Record<string, string>;
}

interface Diagnostics {
  min_radius: number;
  total_triplets_checked: number;
  valid_triplets: number;
  skipped_triplets: number;
  calculation_steps: {
    step_1: CalculationStep;
    step_2: CalculationStep;
    step_3: CalculationStep;
    step_4: CalculationStep;
    conclusion: {
      description: string;
      threshold: string;
      result: string;
      classification: string;
    };
  };
}

interface CurvatureDiagnosticsProps {
  diagnostics: Diagnostics | null;
  curvature: number;
}

export function CurvatureDiagnostics({ diagnostics, curvature }: CurvatureDiagnosticsProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Only show diagnostics for sharp turns
  if (curvature !== 1 || !diagnostics || diagnostics.min_radius === undefined) {
    return null;
  }

  const { calculation_steps } = diagnostics;

  return (
    <div className="curvature-diagnostics">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="diagnostic-header"
        aria-expanded={isOpen}
        aria-controls="diagnostic-content"
      >
        <div className="header-content">
          <div className="warning-badge">
            ⚠️ Sharp Turn Detected
          </div>
          <div className="radius-value">
            Radius: {diagnostics.min_radius.toFixed(1)}m (Threshold: 10m)
          </div>
        </div>
        {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {/* Dropdown Content */}
      {isOpen && (
        <div id="diagnostic-content" className="diagnostic-content">
          {/* Summary */}
          <div className="summary">
            <h4>📊 Analysis Summary</h4>
            <ul>
              <li>Total points analyzed: <strong>{diagnostics.total_triplets_checked + 2}</strong></li>
              <li>Triplets checked: <strong>{diagnostics.total_triplets_checked}</strong></li>
              <li>Valid triplets: <strong>{diagnostics.valid_triplets}</strong></li>
              <li>Sharpest radius found: <strong>{diagnostics.min_radius.toFixed(1)}m</strong></li>
            </ul>
          </div>

          {/* Calculation Explanation */}
          <div className="calculation-explanation">
            <h4>How the Curvature Was Calculated</h4>
            <p className="explanation-intro">
              We analyze the path by sliding a 3-point window along the centerline.
              For each set of 3 consecutive points, we calculate the radius of the circle
              that passes through all three points (circumcircle). The smallest radius
              indicates the sharpest turn.
            </p>

            {/* Step 1: Measure Sides */}
            <div className="calc-step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h5>{calculation_steps.step_1.description}</h5>
                <div className="formula">{calculation_steps.step_1.formula}</div>
                {calculation_steps.step_1.values && (
                  <div className="values">
                    {Object.entries(calculation_steps.step_1.values).map(([key, value]) => (
                      <div key={key} className="value-item">
                        <span className="label">{key.replace('_', ' ')}:</span>
                        <span className="value">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Semi-perimeter */}
            <div className="calc-step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h5>{calculation_steps.step_2.description}</h5>
                <div className="formula">{calculation_steps.step_2.formula}</div>
                {calculation_steps.step_2.calculation && (
                  <div className="calculation">{calculation_steps.step_2.calculation}</div>
                )}
                <div className="result">= {calculation_steps.step_2.result}</div>
              </div>
            </div>

            {/* Step 3: Triangle Area */}
            <div className="calc-step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h5>{calculation_steps.step_3.description}</h5>
                <div className="formula">{calculation_steps.step_3.formula}</div>
                {calculation_steps.step_3.calculation && (
                  <div className="calculation">{calculation_steps.step_3.calculation}</div>
                )}
                <div className="result">= {calculation_steps.step_3.result}</div>
              </div>
            </div>

            {/* Step 4: Circumradius */}
            <div className="calc-step">
              <div className="step-number">4</div>
              <div className="step-content">
                <h5>{calculation_steps.step_4.description}</h5>
                <div className="formula">{calculation_steps.step_4.formula}</div>
                {calculation_steps.step_4.calculation && (
                  <div className="calculation">{calculation_steps.step_4.calculation}</div>
                )}
                <div className="result">= {calculation_steps.step_4.result}</div>
              </div>
            </div>

            {/* Conclusion */}
            <div className="conclusion">
              <h5>📌 Conclusion</h5>
              <div className="comparison">
                <div className="value-comparison">
                  <span className="calculated">Calculated radius: {calculation_steps.conclusion.result}</span>
                  <span className="operator">&lt;</span>
                  <span className="threshold">Threshold: {calculation_steps.conclusion.threshold}</span>
                </div>
                <div className="classification sharp-turn">
                  {calculation_steps.conclusion.classification}
                </div>
              </div>
              <p className="explanation">
                Since the calculated radius ({calculation_steps.conclusion.result}) is less than
                the threshold ({calculation_steps.conclusion.threshold}), this segment contains
                a sharp turn that requires cyclist attention.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CurvatureDiagnostics;
