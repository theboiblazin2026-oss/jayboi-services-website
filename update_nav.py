import os

def update_files():
    files = [f for f in os.listdir('.') if f.endswith('.html')]
    
    for file in files:
        with open(file, 'r') as f:
            content = f.read()
        
        original_content = content
        
        # Update Footer
        if 'Refund Policy' not in content:
            terms_link = '<a href="terms.html" style="color: var(--accent);">Terms of Service</a>'
            refund_link = '<a href="terms.html" style="color: var(--accent);">Terms of Service</a> |\n                <a href="refund-policy.html" style="color: var(--accent);">Refund Policy</a>'
            
            if terms_link in content:
                content = content.replace(terms_link, refund_link)
                print(f"Updated footer in {file}")
            else:
                # Try finding it without the style if slight variation (unlikely but safe)
                pass
        
        # Update Navigation to include About AND Reviews
        if 'href="about.html"' not in content:
            # Try to find standard services link
            services_link = '<a href="services.html">Services</a>'
            # Add About AND Reviews
            new_links = '<a href="services.html">Services</a>\n                    <a href="about.html">About</a>\n                    <a href="reviews.html">Reviews</a>'
            
            if services_link in content:
                content = content.replace(services_link, new_links)
                print(f"Updated nav in {file}")
            elif '<a href="services.html" class="active">Services</a>' in content:
                 content = content.replace(
                     '<a href="services.html" class="active">Services</a>',
                     '<a href="services.html" class="active">Services</a>\n                    <a href="about.html">About</a>\n                    <a href="reviews.html">Reviews</a>'
                 )
                 print(f"Updated nav (active) in {file}")

        if content != original_content:
            with open(file, 'w') as f:
                f.write(content)

if __name__ == '__main__':
    update_files()
