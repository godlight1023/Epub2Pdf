import JSZip from 'https://esm.sh/jszip@3.10.1';
import { jsPDF } from 'https://esm.sh/jspdf@2.5.1';

// Cache the font in memory (either downloaded or user-provided)
let cachedFontBase64: string | null = null;
let isUserProvided = false;

// Font Sources (Fallback if no user font is provided)
const FONT_URLS = [
  "https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@v1.3.2/LXGWWenKaiLite-Regular.ttf",
  "https://raw.githubusercontent.com/lxgw/LxgwWenKai-Lite/main/LXGWWenKaiLite-Regular.ttf"
];

const FONT_NAME = "CustomFont";

/**
 * Allow the user to upload a local .ttf file to be used instead of downloading one.
 */
export const setCustomFont = async (file: File): Promise<void> => {
  try {
    const buffer = await file.arrayBuffer();
    
    // Convert to Base64
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    const chunkSize = 0x8000; // 32KB
    
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(
        null, 
        Array.from(bytes.subarray(i, Math.min(i + chunkSize, len)))
      );
    }
    
    cachedFontBase64 = btoa(binary);
    isUserProvided = true;
    console.log("Custom font loaded successfully");
  } catch (e) {
    console.error("Failed to load custom font", e);
    throw new Error("Failed to process custom font file.");
  }
};

export const isCustomFontLoaded = () => isUserProvided;

async function getFontBase64(onProgress?: (msg: string) => void): Promise<string> {
  // 1. Use cached/user-provided font if available
  if (cachedFontBase64) {
    if (onProgress && isUserProvided) onProgress("Using local custom font...");
    else if (onProgress) onProgress("Using cached font...");
    return cachedFontBase64;
  }

  // 2. Download from CDN if no local font provided
  let lastError;
  for (const url of FONT_URLS) {
    try {
      if (onProgress) onProgress(`Downloading font... (${new URL(url).hostname})`);
      const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const len = bytes.byteLength;
      const chunkSize = 0x8000;
      
      for (let i = 0; i < len; i += chunkSize) {
        binary += String.fromCharCode.apply(
          null, 
          Array.from(bytes.subarray(i, Math.min(i + chunkSize, len)))
        );
      }
      
      cachedFontBase64 = btoa(binary);
      isUserProvided = false;
      return cachedFontBase64;
    } catch (error: any) {
      console.warn(`Failed to load font from ${url}:`, error);
      lastError = error;
    }
  }

  throw new Error(`Failed to download font. Please use the 'Load Custom Font' button to upload a local .ttf file (e.g., Arial, SimHei). Details: ${lastError?.message}`);
}

/**
 * A lightweight client-side EPUB parser and PDF generator.
 */
export const convertEpubToPdf = async (
  file: File, 
  onProgress: (percent: number) => void
): Promise<{ blob: Blob, textPreview: string }> => {
  try {
    onProgress(1); // Started
    
    // 0. Pre-load Font
    const fontBase64 = await getFontBase64((msg) => console.log(msg));

    onProgress(10);
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // 1. Find Container
    const containerFile = zip.file("META-INF/container.xml");
    if (!containerFile) throw new Error("Invalid EPUB: Missing META-INF/container.xml");
    const containerXml = await containerFile.async("string");
    
    const opfPathMatch = containerXml.match(/full-path="([^"]+)"/);
    if (!opfPathMatch) throw new Error("Invalid EPUB: Could not find OPF path");
    const opfPath = opfPathMatch[1];
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    onProgress(15);

    // 2. Read OPF using DOMParser (Robust XML parsing)
    const opfFile = zip.file(opfPath);
    if (!opfFile) throw new Error("Invalid EPUB: OPF file missing");
    const opfContent = await opfFile.async("string");
    
    const parser = new DOMParser();
    const opfDoc = parser.parseFromString(opfContent, "text/xml");
    
    // Check for XML parsing errors
    const parseError = opfDoc.querySelector("parsererror");
    if (parseError) {
        console.warn("XML Parsing warning, trying regex fallback...", parseError.textContent);
    }

    // Extract Manifest (Resources)
    const manifest: Record<string, string> = {};
    // Handle namespaces by checking both localName and standard tag
    const items = Array.from(opfDoc.getElementsByTagName("item"));
    
    if (items.length === 0) {
        // Fallback: Try accessing via 'manifest' tag then children if getElementsByTagName fails due to namespaces
        const manifestTag = opfDoc.getElementsByTagName("manifest")[0] || opfDoc.getElementsByTagNameNS("*", "manifest")[0];
        if (manifestTag) {
            Array.from(manifestTag.children).forEach(child => {
                 if (child.localName === 'item') items.push(child as Element);
            });
        }
    }

    items.forEach(item => {
        const id = item.getAttribute("id");
        const href = item.getAttribute("href");
        if (id && href) {
            manifest[id] = href;
        }
    });

    // Extract Spine (Order)
    const spineIds: string[] = [];
    const itemrefs = Array.from(opfDoc.getElementsByTagName("itemref"));
    
    if (itemrefs.length === 0) {
         // Fallback for spine
         const spineTag = opfDoc.getElementsByTagName("spine")[0] || opfDoc.getElementsByTagNameNS("*", "spine")[0];
         if (spineTag) {
             Array.from(spineTag.children).forEach(child => {
                 if (child.localName === 'itemref') itemrefs.push(child as Element);
             });
         }
    }

    itemrefs.forEach(itemref => {
        const idref = itemref.getAttribute("idref");
        if (idref) {
            spineIds.push(idref);
        }
    });

    console.log(`Parsed EPUB: ${spineIds.length} chapters found.`);
    if (spineIds.length === 0) {
        throw new Error("Could not find any chapters in this EPUB. File structure may be unsupported.");
    }

    onProgress(20);

    // 3. Initialize PDF
    const doc = new jsPDF();
    doc.addFileToVFS("CustomFont.ttf", fontBase64);
    doc.addFont("CustomFont.ttf", FONT_NAME, "normal");
    doc.setFont(FONT_NAME);
    doc.setFontSize(12);

    let y = 20;
    const margin = 20;
    const lineHeight = 7;
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const maxLineWidth = pageWidth - margin * 2;
    let fullTextPreview = "";

    const addNewPage = () => {
      doc.addPage();
      doc.setFont(FONT_NAME); 
      y = margin;
    };

    // Helper: Resolve relative image paths (e.g. "../Images/cover.jpg" -> "OEBPS/Images/cover.jpg")
    const resolveImagePath = (currentFilePath: string, relativeSrc: string) => {
        if (!relativeSrc || relativeSrc.startsWith('http')) return null;
        
        // Remove anchor hashes if present (e.g. image.jpg#xywh=...)
        const cleanSrc = relativeSrc.split('#')[0];
        
        const stack = currentFilePath.split('/');
        stack.pop(); // Remove current filename
        
        const parts = cleanSrc.split('/');
        for (const part of parts) {
            if (part === '.' || part === '') continue;
            if (part === '..') {
                if (stack.length > 0) stack.pop();
            } else {
                stack.push(part);
            }
        }
        return decodeURIComponent(stack.join('/'));
    };

    // 4. Process Chapters
    const totalChapters = spineIds.length;
    let processedChapters = 0;

    for (const id of spineIds) {
      const href = manifest[id];
      if (!href) continue;

      const fullPath = opfDir + href;
      const fileInZip = zip.file(fullPath);
      
      if (fileInZip) {
        let content = await fileInZip.async("string");
        
        // Use DOMParser to handle both Text and Images
        // "application/xhtml+xml" is safer for EPUBs, but "text/html" is more forgiving of errors.
        const docHtml = parser.parseFromString(content, "text/html");

        // Linearize the DOM into a list of actions
        type ContentItem = 
            | { type: 'text', val: string }
            | { type: 'image', val: string }
            | { type: 'newline' };

        const items: ContentItem[] = [];
        
        const traverse = (node: Node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                const tag = el.tagName.toLowerCase();
                
                // Skip head, style, script
                if (['head', 'style', 'script', 'title', 'meta', 'link'].includes(tag)) return;

                if (tag === 'img' || tag === 'image' /* SVG image tag */) {
                    const src = el.getAttribute('src') || el.getAttribute('xlink:href'); // Handle SVG xlink
                    if (src) items.push({ type: 'image', val: src });
                    return; 
                }
                
                // SVG wrapper handling (common in covers)
                if (tag === 'svg') {
                    // Try to find image inside svg
                    const innerImg = el.querySelector('image, img');
                    if (innerImg) {
                        const src = innerImg.getAttribute('src') || innerImg.getAttribute('xlink:href');
                        if (src) items.push({ type: 'image', val: src });
                    }
                    return; 
                }

                // Headings
                if (/^h[1-6]$/.test(tag)) {
                     items.push({ type: 'newline' });
                     items.push({ type: 'newline' });
                }

                node.childNodes.forEach(child => traverse(child));
                
                // Block level elements that cause a break
                if (['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'section', 'article'].includes(tag)) {
                    items.push({ type: 'newline' });
                }
                if (tag === 'br') items.push({ type: 'newline' });

            } else if (node.nodeType === Node.TEXT_NODE) {
                // Collapse whitespace but preserve single spaces
                const text = node.textContent?.replace(/\s+/g, ' ');
                if (text && text.length > 0 && text.trim().length > 0) {
                     items.push({ type: 'text', val: text });
                }
            }
        };

        if (docHtml.body) {
            traverse(docHtml.body);
        } else {
             // Fallback if body is missing (e.g. pure XML structure)
            traverse(docHtml.documentElement);
        }

        // Render Loop
        let textBuffer = "";
        
        for (const item of items) {
            // Buffer text to form paragraphs
            if (item.type === 'text') {
                textBuffer += item.val;
            } else {
                // Flush Buffer
                if (textBuffer) {
                    const cleanText = textBuffer.trim();
                    if (cleanText) {
                         const lines = doc.splitTextToSize(cleanText, maxLineWidth);
                         for (const line of lines) {
                             if (y + lineHeight > pageHeight - margin) addNewPage();
                             doc.text(line, margin, y);
                             y += lineHeight;
                         }
                         if (fullTextPreview.length < 15000) fullTextPreview += cleanText + "\n";
                    }
                    textBuffer = "";
                }

                if (item.type === 'newline') {
                    // Avoid excessive vertical space
                    y += lineHeight * 0.5;
                    if (y > pageHeight - margin) addNewPage();
                } else if (item.type === 'image') {
                    // Render Image
                    try {
                        const imgPath = resolveImagePath(fullPath, item.val);
                        if (imgPath) {
                            const imgFile = zip.file(imgPath);
                            if (imgFile) {
                                const imgData = await imgFile.async("base64");
                                // Simple extension check
                                const ext = imgPath.split('.').pop()?.toLowerCase() || 'jpg';
                                let format = 'JPEG';
                                if (ext.includes('png')) format = 'PNG';
                                if (ext.includes('webp')) format = 'WEBP';
                                if (ext.includes('bmp')) format = 'BMP';

                                const props = doc.getImageProperties(imgData);
                                const imgW = props.width;
                                const imgH = props.height;
                                
                                // Scale to fit page width
                                const scaleFactor = Math.min(maxLineWidth / imgW, 1);
                                const finalW = imgW * scaleFactor;
                                const finalH = imgH * scaleFactor;

                                if (y + finalH > pageHeight - margin) {
                                    addNewPage();
                                }
                                
                                doc.addImage(imgData, format, margin, y, finalW, finalH);
                                y += finalH + lineHeight;
                            } else {
                                console.warn(`Image file not found in zip: ${imgPath}`);
                            }
                        }
                    } catch (err) {
                        console.warn("Error rendering image:", item.val, err);
                    }
                }
            }
        }
        
        // Flush remaining text at end of chapter
        if (textBuffer) {
             const cleanText = textBuffer.trim();
             if (cleanText) {
                const lines = doc.splitTextToSize(cleanText, maxLineWidth);
                for (const line of lines) {
                    if (y + lineHeight > pageHeight - margin) addNewPage();
                    doc.text(line, margin, y);
                    y += lineHeight;
                }
                if (fullTextPreview.length < 15000) fullTextPreview += cleanText + "\n";
             }
        }

        // Chapter spacing
        if (y < pageHeight - margin) y += lineHeight * 2;
        else addNewPage();
      }

      processedChapters++;
      onProgress(20 + Math.floor((processedChapters / totalChapters) * 75));
    }

    onProgress(98);
    const pdfBlob = doc.output('blob');
    onProgress(100);
    
    return { blob: pdfBlob, textPreview: fullTextPreview };

  } catch (error) {
    console.error("Conversion Logic Error:", error);
    throw error;
  }
};