import os
from PIL import Image, ImageDraw

def crear_icono_calendario(size=512):
    scale = 2
    dim = size * scale
    img = Image.new("RGBA", (dim, dim), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = 32 * scale
    card_top = 80 * scale
    card_bottom = dim - pad
    card_left = pad
    card_right = dim - pad
    radius = 64 * scale

    red_corp = (200, 30, 43, 255)       # #c81e2b
    white = (255, 255, 255, 255)
    slate = (100, 116, 139, 255)

    # 1. Base del calendario rojo corporativo
    draw.rounded_rectangle(
        [card_left, card_top, card_right, card_bottom],
        radius=radius,
        fill=red_corp
    )

    # 2. Hoja blanca interior (cuerpo del calendario)
    header_h = 110 * scale
    inner_pad = 14 * scale
    sheet_top = card_top + header_h
    draw.rounded_rectangle(
        [card_left + inner_pad, sheet_top, card_right - inner_pad, card_bottom - inner_pad],
        radius=radius - inner_pad,
        fill=white
    )
    draw.rectangle(
        [card_left + inner_pad, sheet_top, card_right - inner_pad, sheet_top + 20 * scale],
        fill=white
    )

    # 3. Anillos de encuadernación superiores
    ring_w = 26 * scale
    ring_h = 56 * scale
    ring_radius = 12 * scale
    ring_y1 = card_top - 24 * scale
    ring_y2 = ring_y1 + ring_h

    # Anillo izquierdo
    r1_x1 = 130 * scale
    r1_x2 = r1_x1 + ring_w
    draw.rounded_rectangle([r1_x1, ring_y1, r1_x2, ring_y2], radius=ring_radius, fill=white)

    # Anillo derecho
    r2_x1 = dim - (130 * scale) - ring_w
    r2_x2 = r2_x1 + ring_w
    draw.rounded_rectangle([r2_x1, ring_y1, r2_x2, ring_y2], radius=ring_radius, fill=white)

    # 4. Cuadrícula en la hoja blanca
    grid_top = sheet_top + 45 * scale
    grid_left = card_left + 55 * scale
    grid_w = (card_right - card_left - 110 * scale)
    step_x = grid_w / 3.0
    step_y = 65 * scale
    cell_r = 14 * scale

    for row in range(3):
        for col in range(3):
            cx = grid_left + col * step_x + step_x / 2
            cy = grid_top + row * step_y + step_y / 2
            if row == 1 and col == 1:
                draw.ellipse([cx - cell_r * 1.5, cy - cell_r * 1.5, cx + cell_r * 1.5, cy + cell_r * 1.5], fill=red_corp)
                draw.ellipse([cx - cell_r * 0.6, cy - cell_r * 0.6, cx + cell_r * 0.6, cy + cell_r * 0.6], fill=white)
            else:
                draw.ellipse([cx - cell_r, cy - cell_r, cx + cell_r, cy + cell_r], fill=slate)

    return img.resize((size, size), Image.Resampling.LANCZOS)

def generar_ico():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    ruta_assets = os.path.join(base_dir, "assets")
    os.makedirs(ruta_assets, exist_ok=True)
    
    img = crear_icono_calendario(512)
    ruta_png = os.path.join(ruta_assets, "icon.png")
    ruta_ico = os.path.join(ruta_assets, "app.ico")
    ruta_ico2 = os.path.join(ruta_assets, "icon.ico")

    img.save(ruta_png)
    tamanos = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save(ruta_ico, format="ICO", sizes=tamanos)
    img.save(ruta_ico2, format="ICO", sizes=tamanos)
    print(f"Iconos generados exitosamente en: {ruta_assets}")

if __name__ == "__main__":
    generar_ico()

