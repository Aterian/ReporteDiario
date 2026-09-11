import os
from PIL import Image

def generar_ico():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    ruta_png = os.path.join(base_dir, "assets", "Logo_Ingeap1.png")
    ruta_ico = os.path.join(base_dir, "assets", "app.ico")
    
    if not os.path.exists(ruta_png):
        print(f"No se encontró {ruta_png}")
        return
        
    img = Image.open(ruta_png)
    # Crear imagen cuadrada con fondo transparente
    max_dim = max(img.width, img.height)
    square_img = Image.new("RGBA", (max_dim, max_dim), (0, 0, 0, 0))
    offset = ((max_dim - img.width) // 2, (max_dim - img.height) // 2)
    square_img.paste(img, offset, mask=img if img.mode == "RGBA" else None)
    
    # Guardar en formato ICO con múltiples tamaños estándar de Windows
    tamanos = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    square_img.save(ruta_ico, format="ICO", sizes=tamanos)
    print(f"Icono generado exitosamente en: {ruta_ico}")

if __name__ == "__main__":
    generar_ico()
