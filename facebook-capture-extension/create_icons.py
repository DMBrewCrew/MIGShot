from PIL import Image, ImageDraw, ImageFont

# Create icons with camera emoji style
def create_icon(size):
    # Create image with blue background
    img = Image.new('RGB', (size, size), '#1877f2')
    draw = ImageDraw.Draw(img)
    
    # Draw camera shape
    camera_size = int(size * 0.6)
    camera_x = (size - camera_size) // 2
    camera_y = (size - camera_size) // 2
    
    # Camera body
    draw.rounded_rectangle(
        [camera_x, camera_y + camera_size//4, 
         camera_x + camera_size, camera_y + camera_size],
        radius=size//10,
        fill='white'
    )
    
    # Lens
    lens_size = camera_size // 2
    lens_x = camera_x + (camera_size - lens_size) // 2
    lens_y = camera_y + camera_size//2 - lens_size//4
    draw.ellipse(
        [lens_x, lens_y, lens_x + lens_size, lens_y + lens_size],
        fill='#1877f2'
    )
    
    # Flash
    flash_size = camera_size // 6
    flash_x = camera_x + camera_size - flash_size - camera_size//8
    flash_y = camera_y + camera_size//4 + camera_size//10
    draw.ellipse(
        [flash_x, flash_y, flash_x + flash_size, flash_y + flash_size],
        fill='#FFD700'
    )
    
    return img

# Create all three sizes
create_icon(16).save('icon16.png')
create_icon(48).save('icon48.png')
create_icon(128).save('icon128.png')

print("Icons created successfully!")
