export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path.startsWith('/') && request.method === 'GET' && path !== '/image') {
        const uploadKey = path.substring(1); // Remove leading slash
        if (!uploadKey) {
          return new Response('Access denied', { status: 403, headers: corsHeaders });
        }
        return new Response(getUploadHTML(uploadKey), {
          headers: { 'Content-Type': 'text/html', ...corsHeaders }
        });
      }

      if (path === '/upload' && request.method === 'POST') {
        return await handleUpload(request, env);
      }

      if (path === '/image' && request.method === 'GET') {
        return await handleImageView(request, env);
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      return new Response(`Error: ${error.message}`, { 
        status: 500, 
        headers: corsHeaders 
      });
    }
  },
};

async function handleUpload(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('photo');
    const uploadKey = formData.get('key');

    const expectedKey = env.UPLOAD_KEY || 'your-upload-key';
    if (!uploadKey || uploadKey !== expectedKey) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (!file) {
      return new Response('No file uploaded', { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return new Response('Invalid file type. Only JPEG, PNG, GIF, and WebP allowed.', { status: 400 });
    }

    const existingImages = await env.IMAGES.list();
    for (const key of existingImages.keys) {
      await env.IMAGES.delete(key.name);
    }

    const filename = `current-image`;

    const arrayBuffer = await file.arrayBuffer();
    
    await env.IMAGES.put(filename, arrayBuffer, {
      metadata: {
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        uploadDate: new Date().toISOString()
      }
    });

    const imageUrl = `${new URL(request.url).origin}/image`;
    
    return new Response(JSON.stringify({
      success: true,
      filename,
      url: imageUrl,
      message: 'Photo uploaded successfully!'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleImageView(request, env) {
  try {
    const list = await env.IMAGES.list();
    
    if (list.keys.length === 0) {
      return new Response('No image found', { status: 404 });
    }

    const filename = list.keys[0].name;
    const imageData = await env.IMAGES.get(filename, 'arrayBuffer');
    const metadata = await env.IMAGES.getWithMetadata(filename);

    if (!imageData) {
      return new Response('Image not found', { status: 404 });
    }

    return new Response(imageData, {
      headers: {
        'Content-Type': metadata.metadata?.mimeType || 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      }
    });
  } catch (error) {
    return new Response(`Error retrieving image: ${error.message}`, { status: 500 });
  }
}

function getUploadHTML(uploadKey) {
  return `
    <!DOCTYPE html>
    <div class="container">
        <input type="file" id="fileInput" accept="image/*" onchange="uploadFile()">
        <div id="result"></div>
        <style>
        input {
        margin-top: 1rem;
        }
        input::file-selector-button {
        font-weight: bold;
        color: dodgerblue;
        padding: 0.5em;
        border: thin solid grey;
        border-radius: 3px;
        }
</style>
        <div class="current-image">
        <button onclick="document.getElementById('fileInput').click()">
          <img id="currentImage" src="/image" alt="Current photo" 
               onerror="this.style.display='none'; document.getElementById('noImageText').style.display='block';"
               onload="this.style.display='block'; document.getElementById('noImageText').style.display='none';">
          <div id="noImageText" class="no-image"></div>
        </button>
        </div>
    </div>
    <script>
        function resizeImage(e){return new Promise((t=>{const a=new Image;a.onload=()=>{var e=a.width,n=a.height;e>n?e>200&&(n*=200/e,e=200):n>200&&(e*=200/n,n=200);var s=document.createElement("canvas");s.width=e,s.height=n,s.getContext("2d").drawImage(a,0,0,e,n),s.toBlob((e=>{t(e)}),"image/jpeg",.85)},a.src=URL.createObjectURL(e)}))}async function uploadFile(){const e=document.getElementById("fileInput"),t=e.files[0];if(!t)return;const a=document.getElementById("result");a.innerHTML="...",a.className="result";try{const n=await resizeImage(t),s=new FormData;s.append("photo",n,"image.jpg"),s.append("key","${uploadKey}");const o=await fetch("/upload",{method:"POST",body:s});(await o.json()).success?(a.innerHTML="200",a.className="result success",document.getElementById("currentImage").src="/image?"+Date.now(),e.value="",setTimeout((()=>{a.innerHTML="",a.className=""}),3e3)):(a.innerHTML="200",a.className="result error")}catch(e){a.innerHTML="200",a.className="result error"}}
    </script>
    </html>
  `;
}
