import React from "react";
import { motion } from "framer-motion";

export default function Cell({ r, c, value, initial, solvedValue, selected, onSelect, onSet, shake }) {
  const isPrefilled = initial !== 0;

  return (
    <motion.div
      layout
      onClick={onSelect}
      className={`cell ${isPrefilled ? "prefilled" : ""} ${selected ? "selected" : ""} ${shake ? "shake" : ""} ${((Math.floor(r/3)) + (Math.floor(c/3))) % 2 === 0 ? "box-tint-a" : "box-tint-b"}`}
      whileTap={{ scale: 0.96 }}
      animate={ selected ? { y: -4, boxShadow: "0 12px 30px rgba(0,0,0,0.45)" } : { y: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" } }
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    >
      <motion.span
        key={value}
        initial={{ y: -8, opacity: 0, scale: 0.92 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
        className="cell-value"
      >
        {value === 0 ? "" : value}
      </motion.span>
    </motion.div>
  );
}
