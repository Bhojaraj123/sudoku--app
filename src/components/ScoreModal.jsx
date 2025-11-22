import React from "react";

export default function ScoreModal({ open, breakdown = [], total = 0, onClose = () => {} }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Stage Score Breakdown</h3>
        <div className="modal-body">
          <table className="breakdown-table">
            <thead>
              <tr><th>#</th><th>Cell</th><th>Value</th><th>Base</th><th>Bonus</th><th>Points</th></tr>
            </thead>
            <tbody>
              {breakdown.map((b, i) => (
                <tr key={i}>
                  <td>{i+1}</td>
                  <td>{`${b.r+1},${b.c+1}`}</td>
                  <td>{b.value}</td>
                  <td>{b.base}</td>
                  <td>{b.bonus}</td>
                  <td>{b.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="modal-total">Stage total: <strong>{total}</strong></div>
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
