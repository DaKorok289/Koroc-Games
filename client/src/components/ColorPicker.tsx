import { useState } from "react";
import { PLAYER_COLOR_PRESETS, SHOP_COLORS } from "@koroc/shared";
import { useGame } from "../context/GameContext";

export function ColorPicker() {
  const { myColor, setMyColor, shop } = useGame();
  const [open, setOpen] = useState(false);

  const ownedShopColors = SHOP_COLORS.filter((c) => shop.owned.includes(c.id));

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
          {ownedShopColors.length > 0 && <div className="color-swatch-divider" />}
          {ownedShopColors.map((item) => (
            <button
              key={item.id}
              className={`color-swatch${item.color === myColor ? " selected" : ""}`}
              style={{ backgroundColor: item.color }}
              onClick={() => {
                setMyColor(item.color);
                setOpen(false);
              }}
              type="button"
              title={item.label}
              aria-label={`Use color ${item.label}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
