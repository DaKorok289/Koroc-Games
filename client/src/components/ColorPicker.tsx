import { useState } from "react";
import { PLAYER_COLOR_PRESETS } from "@koroc/shared";
import { useGame } from "../context/GameContext";

export function ColorPicker() {
  const { myColor, setMyColor } = useGame();
  const [open, setOpen] = useState(false);

  return (
    <div className="color-picker">
      <button
        className="color-swatch-btn"
        style={{ backgroundColor: myColor }}
        onClick={() => setOpen((o) => !o)}
        type="button"
        title="Choose your character color"
        aria-label="Choose your character color"
      />
      {open && (
        <div className="color-swatch-menu">
          {PLAYER_COLOR_PRESETS.map((color) => (
            <button
              key={color}
              className={`color-swatch${color === myColor ? " selected" : ""}`}
              style={{ backgroundColor: color }}
              onClick={() => {
                setMyColor(color);
                setOpen(false);
              }}
              type="button"
              aria-label={`Use color ${color}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
