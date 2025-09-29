/**
 * @typedef {{
    fileName:string,
    zPos: number,
    custom_animation: string?,
    parentName: string,
    name: string,
    variant: string,
    supportedAnimations: string
}} ItemToDraw

 * @typedef {{
bodyTypeName: string,
url: string,
spritesheets: string,
version: number,
datetime: string,
credits: string[],
}} ItemsMeta
*/

$.expr[":"].icontains = function (a, i, m) {
return jQuery(a).text().toUpperCase().indexOf(m[3].toUpperCase()) >= 0;
};

// copied from https://github.com/mikemaccana/dynamic-template/blob/046fee36aecc1f48cf3dc454d9d36bb0e96e0784/index.js
const es6DynamicTemplate = (templateString, templateVariables) =>
templateString.replace(/\${(.*?)}/g, (_, g) => templateVariables[g]);

// adapted from tiny-debounce
// https://github.com/vuejs-tips/tiny-debounce/blob/ac7eb88715b9fb81124d4d5fa714abde0853dce9/index.js
function debounce(fn, delay) {
let timeoutID = null;
return function () {
clearTimeout(timeoutID);
const args = arguments;
timeoutID = setTimeout(() => {
 fn.apply(this, args);
}, delay);
};
}

// DEBUG mode will be turned on if on localhost and off in production
// but this can be overridden by adding debug=(true|false) to the querystring.
/*
debug isLocalhost result
true  true        true
true  false       true
false true        false
false false       false
unset true        true
unset false       false
*/
const boolMap = {
true: true,
false: false,
};
const bool = (s) => boolMap[s] ?? null;
const isLocalhost = window.location.hostname === "localhost";
const debugQueryString = () => bool(jHash.val("debug"));
const DEBUG = debugQueryString() ?? isLocalhost;

$(document).ready(function () {
let matchBodyColor = true;

/** @type {ItemToDraw[]} */
let itemsToDraw = [];

/** @type {ItemsMeta} */
let itemsMeta = {};

let params = jHash.val();
let sheetCredits = [];

let imagesToLoad = 0;
let imagesLoaded = 0;
let didStartRenderAfterLoad = false;

const canvas = $("#spritesheet").get(0);
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const images = {};
const universalFrameSize = 64;
const universalSheetWidth = 832;
const universalSheetHeight = 3456;

const base_animations = {
spellcast: 0,
thrust: 4 * universalFrameSize,
walk: 8 * universalFrameSize,
slash: 12 * universalFrameSize,
shoot: 16 * universalFrameSize,
hurt: 20 * universalFrameSize,
climb: 21 * universalFrameSize,
idle: 22 * universalFrameSize,
jump: 26 * universalFrameSize,
sit: 30 * universalFrameSize,
emote: 34 * universalFrameSize,
run: 38 * universalFrameSize,
combat_idle: 42 * universalFrameSize,
backslash: 46 * universalFrameSize,
halfslash: 50 * universalFrameSize,
};

const animationFrameCounts = {
spellcast: 7,
thrust: 8,
walk: 9,
slash: 6,
shoot: 13,
hurt: 6,
climb: 6,
idle: 2,
jump: 5,
sit: 3,
emote: 3,
run: 8,
combat_idle: 2,
backslash: 13,
halfslash: 7
};

const sexes = ["male", "female", "teen", "child", "muscular", "pregnant"];

const allElements = document.querySelectorAll("#chooser [id][type=radio]");
const ids = Array.prototype.map.call(allElements, (el) => el.id);

const getBodyTypeName = () => {
return whichPropCheckedExact("sex", sexes);
};

// Preview Animation
let past = Date.now();
const anim = $("#previewAnimations").get(0);
const animCtx = anim.getContext("2d");
let animationItems = [1, 2, 3, 4, 5, 6, 7, 8]; // default for walk
let animRowStart = 8; // default for walk
let animRowNum = 4; // default for walk
let currentAnimationItemIndex = 0;
let activeCustomAnimation = "";
let addedCustomAnimations = [];

// Global variables for custom animations (added for compatibility)
const customAnimations = {};
const animationRowsLayout = {};

// Missing function stubs for category export
function drawFrameToFrame(destCtx, destPos, destSize, src, srcPos, srcSize) {
destCtx.drawImage(src,
 srcPos.x, srcPos.y, srcSize, srcSize,
 destPos.x, destPos.y, destSize, destSize);
}

function customAnimationSize(customAnim) {
if (!customAnim || !customAnim.frameSize || !customAnim.frames) {
 return { width: universalFrameSize, height: universalFrameSize };
}
const frameSize = customAnim.frameSize;
const width = customAnim.frames[0] ? customAnim.frames[0].length * frameSize : frameSize;
const height = customAnim.frames.length * frameSize;
return { width, height };
}

function customAnimationBase(customAnim) {
return customAnim && customAnim.base ? customAnim.base : "walk";
}

function isCustomAnimationBasedOnStandardAnimation(customAnim, standardAnim) {
const base = customAnimationBase(customAnim);
return base === standardAnim;
}

// on hash (url) change event, interpret and redraw
jHash.change(function () {
params = jHash.val();
interpretParams();
redraw();
});

interpretParams();
if (Object.keys(params).length == 0) {
$("input[type=reset]").click();
setParams();
selectDefaults();
}
redraw();
showOrHideElements();
nextFrame();

function getParent(id) {
const el = document.getElementById(id);
return el.getAttribute("parentname");
}

// set params and redraw when any radio button is clicked on
$("#chooser input[type=radio]").each(function () {
$(this).click(function () {
 if (matchBodyColor) {
   matchBodyColorForThisAsset = $(this).attr("matchBodyColor");
   if (
     matchBodyColorForThisAsset &&
     matchBodyColorForThisAsset != "false"
   ) {
     selectColorsToMatch($(this).attr("variant"));
   }
 }
 setParams();
 redraw();
 showOrHideElements();
});
});

$("#controls>details").on("toggle", function (event) {
$("#preview-animations").toggleClass(
 "controls-open",
 $(event.target).attr("open")
);
});

// Toggle display of a list elements children when clicked
// Again, do not multiple toggle when clicking on children
$("#chooser ul>li").click(function (event) {
$(this).children("span").toggleClass("condensed").toggleClass("expanded");
const $ul = $(this).children("ul");
$ul.toggle("slow").promise().done(drawPreviews);
event.stopPropagation();
});

$("#collapse").click(function () {
$("#chooser>details>ul ul").hide("slow");
$("#chooser>details>ul span.expanded")
 .removeClass("expanded")
 .addClass("condensed");
});
$("#expand").click(function () {
let parents = $('input[type="radio"]:checked').parents("ul");
parents.prev("span").addClass("expanded").removeClass("condensed");
parents.show().promise().done(drawPreviews);
});

function search() {
$(".search-result").removeClass("search-result");
let query = $("#searchbox").val();
if (query != "" && query.length > 1) {
 let results = $("#chooser li>span:icontains(" + query + ")").addClass(
   "search-result"
 );
 const matches = results.length;
 $("#matches").text(`${matches} matches.`);
 let parents = results.parents("ul");
 parents.prev("span").addClass("expanded").removeClass("condensed");
 for (const parent of parents.toArray().reverse()) {
   $(parent)
     .delay(50)
     .show()
     .map((i, el) => {
       setTimeout(() => drawPreviews.call(el), 50 * i);
     });
 }
}
}
$("#searchbox").on("search", search);
$("#search").click(search);
$("#searchbox").on("input", function () {
if ($("#searchbox").val().length >= 3) {
 debounce(search, 500)();
} else {
 $("#matches").val("");
}
});
$("#customizeChar").on("submit", function (e) {
search();
e.preventDefault();
});

$("#displayMode-compact").click(function () {
$("#chooser").toggleClass("compact");
});

$("#match_body-color").click(function () {
matchBodyColor = $(this).is(":checked");
});

$("#scroll-to-credits").click(function (e) {
$("#credits")[0].scrollIntoView();
e.preventDefault();
});

$("#previewFile").change(function () {
previewFile();
});

$("#ZPOS").change(function () {
previewFile();
});

$("#saveAsPNG").click(function () {
renameImageDownload(
 this,
 canvas,
 "Download" + Math.floor(Math.random() * 100000) + ".png"
);
return true;
});

$("#resetAll").click(function () {
window.setTimeout(
 function () {
   document.getElementById("previewFile").value = "";
   images["uploaded"] = null;
   document.getElementById("ZPOS").value = 0;
   params = {};
   jHash.val(params);
   interpretParams();
   selectDefaults();
   redraw();
   showOrHideElements();
 },
 0,
 false
);
});

$(".removeIncompatibleWithLicenses").click(function () {
const allowedLicenses = getAllowedLicenses();
const bodyTypeName = getBodyTypeName();
$("#chooser li.variant-list").each(function () {
 const $this = $(this);
 let licenses = $this.data(`${bodyTypeName}_licenses`);
 $this.find("input[type=radio]").each(function () {
   const $parent = $this;
   const $el = $(this);
   // check if variant specific license; otherwise fall back to list licenses
   licenses = $(this).data(`layer_1_${bodyTypeName}_licenses`) || licenses;

   // Toggle allowed licenses
   if (licenses !== undefined) {
     const licensesForAsset = licenses.split(",");
     if (
       !allowedLicenses.some((allowedLicense) =>
         licensesForAsset.includes(allowedLicense)
       )
     ) {
       if ($el.prop("checked")) {
         $el.attr("checked", false).prop("checked", false);
         $parent.find("input[type=radio][id*=none]").click();
       }
     }
   }
 });
});
setParams();
redraw();
showOrHideElements();
});

$(".removeUnsupported").click(function () {
const selectedAnims = getSelectedAnimations();
$("#chooser input[type=radio]").each(function () {
 const $li = $(this).closest("li[data-animations]");
 if ($li.data("animations") && selectedAnims.length > 0) {
   const requiredAnimations = $li.data("animations").split(",");
   for (const selectedAnim of selectedAnims) {
     if (!requiredAnimations.includes(selectedAnim)) {
       if ($(this).prop("checked")) {
         $(this).attr("checked", false).prop("checked", false);
         $(this)
           .closest("ul")
           .find("input[type=radio][id*=none]:not(:checked)")
           .click();
       }
     }
   }
 }
});
setParams();
redraw();
showOrHideElements();
return false;
});

$(".replacePinkMask").click(function () {
const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height),
 pix = imgData.data,
 n = pix.length;

for (let i = 0; i < n; i += 4) {
 const a = pix[i + 3];
 if (a > 0) {
   const r = pix[i];
   const g = pix[i + 1];
   const b = pix[i + 2];
   if (r === 255 && g === 44 && b === 230) {
     pix[i + 3] = 0;
   }
 }
}
ctx.putImageData(imgData, 0, 0);
});

$(".generateSheetCreditsCsv").click(function () {
let bl = new Blob([sheetCreditsToCSV()], {
 type: "text/html",
});
let a = document.createElement("a");
a.href = URL.createObjectURL(bl);
a.download = "sheet-credits.csv";
a.hidden = true;
document.body.appendChild(a);
a.innerHTML = "dummyhtml";
a.click();
document.body.removeChild(a);
});

$(".importFromClipboard").click(async function () {
const clipboardText = await navigator.clipboard.readText();
const spritesheet = JSON.parse(clipboardText)["layers"];
window.setTimeout(
 function () {
   $("#resetAll").click(); //Reset first so defaults are set properly
 },
 1,
 false
);
window.setTimeout(
 function () {
   setParamsFromImport(spritesheet); //wait for reset function(s) to complete then apply spritesheet
 },
 2,
 false
);
});

$(".exportToClipboard").click(function () {
const spritesheet = Object.assign({}, itemsMeta);
spritesheet.layers = itemsToDraw;
navigator.clipboard.writeText(JSON.stringify(spritesheet, null, "  "));
});

$(".generateSheetCreditsTxt").click(function () {
let bl = new Blob([sheetCreditsToTxt()], {
 type: "text/html",
});
let a = document.createElement("a");
a.href = URL.createObjectURL(bl);
a.download = "sheet-credits.txt";
a.hidden = true;
document.body.appendChild(a);
a.innerHTML = "dummyhtml";
a.click();
document.removeChild(a);
});

$("#frame-cycle").text(animationItems.join("-")); // for default animation, walk

$("#whichAnim").change(function () {
animationItems = [];
const selectedAnim = $("#whichAnim>:selected");
const selectedAnimationValue = $("#whichAnim>:selected").text();
const animRowFrames = parseInt(selectedAnim.data("cycle"));
animRowStart = parseInt(selectedAnim.data("row"));
animRowNum = parseInt(selectedAnim.data("num"));

function clearClasses() {
 let classes = document.getElementById("preview").classList.values();
 classes = classes.filter((className) =>
   className.startsWith("anim-canvas-")
 );
 for (const className of classes) {
   $("#preview").removeClass(className);
 }
}

currentAnimationItemIndex = 0;
activeCustomAnimation = "";
if (addedCustomAnimations.includes(selectedAnimationValue)) {
 activeCustomAnimation = selectedAnimationValue;
}
if (activeCustomAnimation !== "") {
 const selectedCustomAnimation = customAnimations[activeCustomAnimation];
 const frameSize = selectedCustomAnimation.frameSize;
 anim.setAttribute("width", 4 * frameSize);
 anim.setAttribute("height", frameSize);
 animRowNum = selectedCustomAnimation.frames.length;
 animRowStart = 0;
 for (let i = 0; i < selectedCustomAnimation.frames[0].length; ++i) {
   if (selectedCustomAnimation.skipFirstFrameInPreview && i === 0) {
     continue;
   }
   animationItems.push(i);
 }
 $("#frame-cycle").text(animationItems.join("-"));
 clearClasses();
 $("#preview").addClass(`anim-canvas-${frameSize}`);
 return;
} else {
 anim.setAttribute("width", 4 * universalFrameSize);
 anim.setAttribute("height", universalFrameSize);
 clearClasses();
 $("#preview").addClass(`anim-canvas-${universalFrameSize}`);
}
const animRowFramesCustom = selectedAnim.data("cycle-custom");
if (animRowFramesCustom !== undefined) {
 animationItems = animRowFramesCustom.split("-").map(Number);
 if (animationItems.length > 0) {
   $("#frame-cycle").text(animRowFramesCustom);
   return;
 }
}
for (let i = 1; i < animRowFrames; ++i) {
 animationItems.push(i);
}
$("#frame-cycle").text(animationItems.join("-"));
});

function newZip() {
const zip = new JSZip();

const creditsFolder = zip.folder("credits");

if (!creditsFolder) {
 throw new Error("Failed to create folder structure in zip file");
}

// Add JSON export
try {
 const spritesheet = Object.assign({}, itemsMeta);
 spritesheet.layers = itemsToDraw;
 zip.file("character.json", JSON.stringify(spritesheet, null, 2));
} catch (err) {
 throw new Error(`Failed to add character.json: ${err.message}`);
}

// Add credits in multiple formats
try {
 creditsFolder.file("credits.txt", sheetCreditsToTxt());
 creditsFolder.file("credits.csv", sheetCreditsToCSV());
} catch (err) {
 throw new Error(`Failed to add credits files: ${err.message}`);
}

return zip
}

async function downloadZip(zip, filename) {
try {
 const content = await zip.generateAsync({
   type: 'blob',
   compression: 'DEFLATE',
   compressionOptions: { level: 9 }
 });

 const link = document.createElement('a');
 link.download = filename;
 link.href = URL.createObjectURL(content);
 link.click();
 URL.revokeObjectURL(link.href);
} catch (err) {
 throw new Error(`Failed to generate zip file: ${err.message}`);
}
}

// Helper to convert canvas to blob
const canvasToBlob = (canvas) => {
return new Promise((resolve, reject) => {
 try {
   canvas.toBlob((blob) => {
     if (blob) {
       resolve(blob);
     } else {
       reject(new Error("Failed to create blob from canvas"));
     }
   }, 'image/png');
 } catch (err) {
   reject(new Error(`Canvas to Blob conversion failed: ${err.message}`));
 }
});
};

const newTimeStamp = () => new Date().toISOString().replace(/[:\.]/g, '-').substring(0, 19);

const addMetadataToZip = (zip, bodyType, timestamp, exportedStandard, failedStandard, exportedCustom, failedCustom) => {
const metadata = {
 exportTimestamp: timestamp,
 bodyType: bodyType,
 standardAnimations: {
   exported: exportedStandard,
   failed: failedStandard
 },
 customAnimations: {
   exported: exportedCustom,
   failed: failedCustom
 },
 frameSize: universalFrameSize,
 frameCounts: animationFrameCounts
};
try {
 const creditsFolder = zip.folder("credits");
 creditsFolder.file("metadata.json", JSON.stringify(metadata, null, 2));
} catch (err) {
 throw new Error(`Failed to add metadata.json: ${err.message}`);
}
return metadata;
}

// This is the new ASYNC drawing function for the EXPORT feature.
async function drawItemSheetForExportAsync(destCanvas, itemToDraw, addedCustomAnimations) {
const destCtx = destCanvas.getContext("2d");
if (!destCtx) return;

// This function handles loading images asynchronously.
const loadImageAsync = (src) => {
   return new Promise((resolve, reject) => {
       const fullSrc = "spritesheets/" + src;
       // Check cache first
       if (images[fullSrc] && images[fullSrc].complete) {
           resolve(images[fullSrc]);
           return;
       }
       if (images[fullSrc]) { // Image is loading, listen for it to finish
           images[fullSrc].onload = () => resolve(images[fullSrc]);
           images[fullSrc].onerror = (err) => reject(err);
           return;
       }
       // Not in cache, create and load it
       const img = new Image();
       img.onload = () => {
           images[fullSrc] = img; // Add to cache on success
           resolve(img);
       };
       img.onerror = () => {
           images[fullSrc] = null; // Cache failure
           reject(new Error(`Failed to load image: ${src}`));
       };
       img.src = fullSrc;
   });
};

const custom_animation = itemToDraw.custom_animation;
if (custom_animation !== undefined) {
   try {
       const img = await loadImageAsync(itemToDraw.fileName);
       const y = customAnimationY(custom_animation, addedCustomAnimations);
       destCtx.drawImage(img, 0, y);
   } catch (error) {
       console.warn(`Could not draw custom animation for ${itemToDraw.fileName}:`, error);
   }
} else {
   // This loop builds the standard spritesheet from its animation parts
   for (const [animName, yOffset] of Object.entries(base_animations)) {
       let animationToCheck = animName;
       if (animName === "combat_idle") animationToCheck = "combat";
       if (animName === "backslash") animationToCheck = "1h_slash";
       if (animName === "halfslash") animationToCheck = "1h_halfslash";
       
       if (itemToDraw.supportedAnimations.includes(animationToCheck)) {
           const { directory, file } = splitFilePath(itemToDraw.fileName);
           const imagePath = `${directory}/${animName}/${file}`;
           try {
               const img = await loadImageAsync(imagePath);
               if (img) {
                   destCtx.drawImage(img, 0, yOffset);
               }
           } catch (error) {
               if (DEBUG) console.warn(`Skipping animation "${animName}" for ${file}:`, error.message);
           }
       }
   }
}
}

// This is the original SYNCHRONOUS drawing function for the MAIN PREVIEW.
function drawItemSheet(destCanvas, itemToDraw, addedCustomAnimations) {
const destCtx = destCanvas.getContext("2d");
const custom_animation = itemToDraw.custom_animation;
if (custom_animation !== undefined) {
   drawCustomAnimationItem(destCtx, itemToDraw, addedCustomAnimations);
} else {
   for (const [key, value] of Object.entries(base_animations)) {
       if (!drawItemOnStandardAnimation(destCtx, value, key, itemToDraw))
           continue;

       let offSetY = universalSheetHeight;
       for (const custAnimName of addedCustomAnimations) {
           const custAnim = customAnimations[custAnimName];
           if (key === customAnimationBase(custAnim)) {
               drawFramesToCustomAnimation(destCtx, custAnim, offSetY, destCanvas, animationRowsLayout);
           }
           offSetY += customAnimationSize(custAnim).height;
       }
   }
}
}

function drawCustomAnimationItem(destCtx, itemToDraw, addedCustomAnimations) {
const custom_animation = itemToDraw.custom_animation;
const filePath = itemToDraw.fileName;
const img = loadImage(filePath, false);
const y = customAnimationY(custom_animation, addedCustomAnimations);
destCtx.drawImage(img, 0, y);
}

/**
* * @param {*} folder 
* @param {string} fileName 
* @param {CanvasImageSource} src 
* @param {{x: number?, y: number?, width: number, height: number}?} srcRect 
*/
async function addAnimationToZipFolder(folder, fileName, src, srcRect) {
const animCanvas = newAnimationFromSheet(src, srcRect);
if (animCanvas) {
 const blob = await canvasToBlob(animCanvas);
 folder.file(fileName, blob);
}
return animCanvas;
}

$(".exportSplitAnimations").click(async function () {
try {
 const zip = newZip();
 const bodyType = getBodyTypeName();
 const timestamp = newTimeStamp()

 // Create folders in zip
 const standardFolder = zip.folder("standard");
 const customFolder = zip.folder("custom");
 const creditsFolder = zip.folder("credits");

 if (!standardFolder || !customFolder || !creditsFolder) {
   throw new Error("Failed to create folder structure in zip file");
 }

 // Export standard animations
 const exportedStandard = [];
 const failedStandard = [];

 for (const [name, y] of Object.entries(base_animations)) {
   try {
     const rows = name === 'hurt' || name === 'climb' ? 1 : 4;
     const frames = animationFrameCounts[name];
     const srcRect = {
       x: 0, y,
       width: frames * universalFrameSize,
       height: rows * universalFrameSize
     };
     const animCanvas = await addAnimationToZipFolder(standardFolder, `${name}.png`,
       canvas, srcRect);

     if (animCanvas)
       exportedStandard.push(name);
   } catch (err) {
     console.error(`Failed to export standard animation ${name}:`, err);
     failedStandard.push(name);
   }
 }

 // Handle custom animations
 const exportedCustom = [];
 const failedCustom = [];
 let y = universalSheetHeight;

 for (const animName of addedCustomAnimations) {
   try {
     const anim = customAnimations[animName];
     if (!anim) {
       throw new Error("Animation definition not found");
     }

     const srcRect = { x: 0, y, ...customAnimationSize(anim) };
     const animCanvas = await addAnimationToZipFolder(customFolder, `${animName}.png`,
       canvas, srcRect);

     if (animCanvas)
       exportedCustom.push(animName);

     y += srcRect.height;
   } catch (err) {
     console.error(`Failed to export custom animation ${animName}:`, err);
     failedCustom.push(animName);
   }
 }

 // Add metadata about the export
 addMetadataToZip(zip, bodyType, timestamp, exportedStandard, failedStandard, exportedCustom, failedCustom);

 // Generate and download zip
 await downloadZip(zip, `lpc_${bodyType}_animations_${timestamp}.zip`);

 // Show success message with any failures
 if (failedStandard.length > 0 || failedCustom.length > 0) {
   const failureMessage = [];
   if (failedStandard.length > 0) {
     failureMessage.push(`Failed to export standard animations: ${failedStandard.join(', ')}`);
   }
   if (failedCustom.length > 0) {
     failureMessage.push(`Failed to export custom animations: ${failedCustom.join(', ')}`);
   }
   alert(`Export completed with some issues:\n${failureMessage.join('\n')}`);
 }

} catch (error) {
 console.error('Export error:', error);
 alert(`Export failed: ${error.message}\nCheck console for details.`);
}
});

const getItemFileName = (item) =>
`${item.zPos}`.padStart(3, '0') + ` ${item.fileName.replace(/\//g, ' ')}`;

function reportFailedItemAnimations(failedStandard, failedCustom) {
const numFailedStandard = Object.keys(failedStandard).length;
const numFailedCustom = Object.keys(failedCustom).length;
if (numFailedStandard > 0 || numFailedCustom > 0) {
 const failureMessage = [];
 if (numFailedStandard > 0) {
   failureMessage.push("Failed to export standard animations:");
   for (const [anim, failedItems] of Object.entries(failedStandard)) {
     for (const item of failedItems) {
       failureMessage.push(`${anim}/${item}`)
     }
   }
 }
 if (numFailedCustom > 0) {
   failureMessage.push("Failed to export custom animations:");
   for (const [anim, failedItems] of Object.entries(failedCustom)) {
     for (const item of failedItems) {
       failureMessage.push(`${anim}/${item}`)
     }
   }
 }
 alert(`Export completed with some issues:\n${failureMessage.join('\n')}`);
}
}

$(".exportSplitItemAnimations").click(async function () {
try {
 const zip = newZip();
 const bodyType = getBodyTypeName();
 const timestamp = newTimeStamp();

 // Create folders in zip
 const standardFolder = zip.folder("standard");
 const customFolder = zip.folder("custom");
 const creditsFolder = zip.folder("credits");

 if (!standardFolder || !customFolder || !creditsFolder) {
   throw new Error("Failed to create folder structure in zip file");
 }

 // Export items to standard animations,
 // and custom animations where applicable
 const exportedStandard = {};
 const failedStandard = {};
 const exportedCustom = {};
 const failedCustom = {};

 for (const name of Object.keys(base_animations)) {
   const animFolder = standardFolder.folder(name);
   const exportedItems = [];
   exportedStandard[name] = exportedItems;
   const failedItems = [];

   for (item of itemsToDraw) {
     const itemFileName = getItemFileName(item);

     try {
       const img = getItemAnimationImage(item, name);
       if (!img)
         continue;

       const animCanvas = await addAnimationToZipFolder(animFolder, itemFileName, img, null);
       if (!animCanvas)
         continue;

       exportedItems.push(itemFileName);

       for (const custAnimName of addedCustomAnimations) {
         const custAnim = customAnimations[custAnimName];
         if (!isCustomAnimationBasedOnStandardAnimation(custAnim, name))
           continue;

         const custExportedItems = exportedCustom[custAnimName] || [];
         exportedCustom[custAnimName] = custExportedItems;
         const custFailedItems = failedCustom[custAnimName] || [];
         try {
           const custAnimFolder = customFolder.folder(custAnimName);
           if (addStandardAnimationToZipCustomFolder(custAnimFolder, itemFileName, img, custAnim))
             custExportedItems.push(itemFileName);
         } catch (err) {
           console.error(`Failed to export item ${itemFileName} in custom animation ${custAnimName}:`, err);
           custFailedItems.push(itemFileName);
           failedCustom[custAnimName] = custFailedItems;
         }
       }
     } catch (err) {
       console.error(`Failed to export item ${itemFileName} in standard animation ${name}:`, err);
       failedItems.push(itemFileName);
       failedStandard[name] = failedItems;
     }
   }
 }

 // Export items exclusive to custom animations
 for (item of itemsToDraw) {
   const custName = item.custom_animation;
   if (!custName)
     continue;

   const itemFileName = getItemFileName(item);
   const custExportedItems = exportedCustom[custName] || [];
   exportedCustom[custName] = custExportedItems;
   const custFailedItems = failedCustom[custName] || [];

   try {
     const img = loadImage(item.fileName, false);
     if (!img)
       continue;

     const custAnim = customAnimations[custName];
     const custSize = customAnimationSize(custAnim);
     const animFolder = customFolder.folder(custName);
     if (await addAnimationToZipFolder(animFolder, itemFileName, img, custSize))
       custExportedItems.push(itemFileName);
   } catch (err) {
     console.error(`Failed to export item ${itemFileName} in custom animation ${custName}:`, err);
     custFailedItems.push(itemFileName);
     failedCustom[custName] = custFailedItems;
   }
 }

 // Add metadata about the export
 addMetadataToZip(zip, bodyType, timestamp, exportedStandard, failedStandard, exportedCustom, failedCustom);

 // Generate and download zip
 await downloadZip(zip, `lpc_${bodyType}_item_animations_${timestamp}.zip`);

 // Show success message with any failures
 reportFailedItemAnimations(failedStandard, failedCustom);

} catch (error) {
 console.error('Export error:', error);
 alert(`Export failed: ${error.message}\nCheck console for details.`);
}
});

// Helper function to check if a region has non-transparent pixels
function hasContentInRegion(ctx, x, y, width, height) {
try {
 const imageData = ctx.getImageData(x, y, width, height);
 return imageData.data.some(pixel => pixel !== 0);
} catch (e) {
 console.warn('Error checking region content:', e);
 return false;
}
}

$(".exportSplitItemSheets").click(async () => {
try {
 const zip = newZip();

 const itemsFolder = zip.folder("items");
 if (!itemsFolder) {
   throw new Error("Failed to create folder structure in zip file");
 }

 const exportedItems = [];
 const failedItems = [];

 for (let itemToDraw of itemsToDraw) {
   const fileName = getItemFileName(itemToDraw);
   try {
     const itemCanvas = document.createElement("canvas");
     itemCanvas.width = canvas.width;
     itemCanvas.height = canvas.height;
     const itemCtx = itemCanvas.getContext("2d");
     itemCtx.clearRect(0, 0, itemCanvas.width, itemCanvas.height);
     await drawItemSheetForExportAsync(itemCanvas, itemToDraw, addedCustomAnimations);

     const blob = await canvasToBlob(itemCanvas);
     await itemsFolder.file(fileName, blob);
     exportedItems.push(fileName);
   } catch (err) {
     console.error(`Failed to export item spritesheet ${fileName}:`, err);
     failedItems.push(fileName);
   }
 }

 const bodyType = getBodyTypeName();
 const timestamp = newTimeStamp();
 await downloadZip(zip, `lpc_${bodyType}_item_spritesheets_${timestamp}.zip`);

 // Show success message with any failures
 if (failedItems.length > 0) {
   const failureMessage = [];
   if (failedItems.length > 0) {
     failureMessage.push(`Failed to export item spritesheets: ${failedItems.join(', ')}`);
   }
   alert(`Export completed with some issues:\n${failureMessage.join('\n')}`);
 }
} catch (error) {
 console.error('Export error:', error);
 alert(`Export failed: ${error.message}\nCheck console for details.`);
}
});

function clearCustomAnimationPreviews() {
for (let i = 0; i < addedCustomAnimations.length; ++i) {
 $("#whichAnim")
   .children(`option[value=${addedCustomAnimations[i]}]`)
   .remove();
}
}

function addCustomAnimationPreviews() {
clearCustomAnimationPreviews();
for (let i = 0; i < addedCustomAnimations.length; ++i) {
 $("#whichAnim").append(
   new Option(`${addedCustomAnimations[i]}`, `${addedCustomAnimations[i]}`)
 );
}
}

$("#spritesheet,#previewAnimations").on("click", function (e) {
$(this).toggleClass("zoomed-in");
});
$("#spritesheet,#previewAnimations").on("dblclick", function (e) {
$(this).toggleClass("zoomed-out");
});

const spritesheetGesture = new TinyGesture(
document.getElementById("spritesheet"),
{ mouseSupport: false }
);
const previewAnimationsGesture = new TinyGesture(
document.getElementById("previewAnimations"),
{ mouseSupport: false }
);

spritesheetGesture.on("pinch", pinch.bind(spritesheetGesture));
previewAnimationsGesture.on("pinch", pinch.bind(previewAnimationsGesture));
spritesheetGesture.on("pinchend", pinchEnd);
previewAnimationsGesture.on("pinchend", pinchEnd);

let initialZoom = null;
function pinch(event) {
const scale = this.scale;
const $target = $(event.target);
if (initialZoom === null) {
 initialZoom = $target.css("zoom") ?? 1;
}
$target.css("zoom", initialZoom * scale);
event.preventDefault();
event.stopImmediatePropagation();
}

function pinchEnd() {
initialZoom = null;
}

function selectDefaults() {
$(`#${"body-Body_color_light"}`).prop("checked", true);
$(`#${"head-Human_male_light"}`).prop("checked", true);
setParams();
}

function selectColorsToMatch(variant) {
const colorToMatch = variant;
$("input[matchBodyColor^=true]:checked").each(function () {
 // 1. Determine the type of asset that is selected (eg. human male)
 const assetType = $(this).attr("parentName").replaceAll(" ", "_");
 // 2. Determine the color of asset that needs to selected (eg. head-human_male_light)
 const assetToSelect =
   $(this).attr("name") + "-" + assetType + "_" + colorToMatch;
 $(`#${assetToSelect}`).prop("checked", true);
});
setParams();
}

function addCreditFor(fileName, licenses, authors, urls, notes) {
if (fileName !== "") {
 let credit = {};
 credit.fileName = fileName;
 credit.licenses = licenses;
 credit.authors = authors;
 credit.urls = urls;
 credit.notes = notes;
 sheetCredits.push(credit);
}
}

function sheetCreditsToCSV() {
const header = "filename,notes,authors,licenses,urls";
let csvBody = header + "\n";
sheetCredits.map(function (credit) {
 if (credit.licenses !== undefined) {
   csvBody += `${credit.fileName},\"${credit.notes}\",\"${credit.authors}\",\"${credit.licenses}\",\"${credit.urls}\"`;
   csvBody += "\n";
 }
});
return csvBody;
}

function sheetCreditsToTxt() {
let creditString = "";
sheetCredits.map(function (credit) {
 if (credit.licenses !== undefined) {
   const licensesForDisplay = `- Licenses:\n\t\t- ${credit.licenses.replaceAll(
     ",",
     "\n\t\t- "
   )}`;
   const authorsForDisplay = `- Authors:\n\t\t- ${credit.authors.replaceAll(
     ",",
     "\n\t\t- "
   )}`;
   const linksForDisplay = `- Links:\n\t\t- ${credit.urls.replaceAll(
     ",",
     "\n\t\t- "
   )}`;
   const notesForDisplay = `- Note: ${credit.notes}`;
   let creditEntry = `${credit.fileName}\n\t${notesForDisplay}\n\t${licensesForDisplay}\n\t${authorsForDisplay}\n\t${linksForDisplay}\n\n`;
   creditString += creditEntry;
 }
});
return creditString;
}

function previewFile() {
const file = document.querySelector("input[type=file]").files[0];
const img = new Image();
img.onload = function () {
 images["uploaded"] = img;
 redraw();
 showOrHideElements();
};
img.src = URL.createObjectURL(file);
}

function renameImageDownload(link, canvasItem, filename) {
link.href = canvasItem.toDataURL();
link.download = filename;
}

function findIdsByRegExp(ids, regExps) {
const reLen = regExps.length;
const els = new Array(reLen);
for (let i = 0; i < reLen; ++i) {
 els[i] = false;
 const re = regExps[i];
 for (const id of ids) {
   if (re.test(id)) {
     const el = document.getElementById(id);
     if (el.checked) {
       els[i] = true;
       return els;
     }
   }
 }
}
return els;
}

function whichPropChecked(ids, key, vals) {
const regExps = vals.map(val => new RegExp(String.raw`^${key}-${val}`, "i"));
const els = findIdsByRegExp(ids, regExps);
for (let i = 0; i < vals.length; ++i) {
 if (els[i] === true) {
   return vals[i];
 }
}
return "ERROR";
}

function whichPropCheckedExact(key, vals) {
for (const val of vals) {
 const el = document.getElementById(`${key}-${val}`);
 if (el.checked) {
   return val;
 }
}
return "ERROR";
}

$("[name=animation]").click(function () {
showOrHideElements();
});

function getSelectedAnimations() {
const $anims = $("[name=animation]:checked");
if ($anims.length > 0) {
 return $anims.map(function () {
   return this.id.replace("animation-", "");
 });
}
return [];
}

$(".licenseCheckBox").click(function () {
showOrHideElements();
});

function getAllowedLicenses() {
return $(".licenseCheckBox:checkbox:checked")
 .map(function () {
   return $(this).val().split(",");
 })
 .get()
 .map((license) => license.trim());
}

function redraw() {
itemsToDraw = [];
const bodyTypeName = getBodyTypeName();

sheetCredits = [];
const baseUrl = window.location.href.split("/").slice(0, -1).join("/"); // get url until last '/'

itemsMeta = {
 bodyTypeName: bodyTypeName,
 url: window.location.href,
 spritesheets: baseUrl + "/spritesheets/", // <- holds base URL to spritesheets (used to download them)
 version: 1, // <- to track future compatibilty breaking changes
 datetime: new Date().toLocaleString(),
 credits: "",
};

$("#chooser input[type=radio]:checked").each(function (index) {
 const $this = $(this);
 for (jdx = 1; jdx < 10; jdx++) {
   const bodyTypeKey = `layer_${jdx}_${bodyTypeName}`;
   if ($this.data(bodyTypeKey)) {
     const $liVariant = $this.closest("li.variant-list");
     const zPos = $this.data(`layer_${jdx}_zpos`);
     const custom_animation = $this.data(`layer_${jdx}_custom_animation`);
     const fileName = $this.data(bodyTypeKey) || $liVariant.data();
     const parentName = $this.attr(`name`);
     const name = $this.attr(`parentName`);
     const variant = $this.attr(`variant`);
     const licenses = $this.data(`${bodyTypeKey}_licenses`) || $liVariant.data(`${bodyTypeName}_licenses`);
     const authors = $this.data(`${bodyTypeKey}_authors`) || $liVariant.data(`${bodyTypeName}_authors`);
     const urls = $this.data(`${bodyTypeKey}_urls`) || $liVariant.data(`${bodyTypeName}_urls`);
     const notes = $this.data(`${bodyTypeKey}_notes`) || $liVariant.data(`${bodyTypeName}_notes`);

     if (fileName !== "") {
       const supportedAnimations = $this
         .closest("[data-animations]")
         .data("animations");
       const itemToDraw = {
         fileName,
         zPos,
         custom_animation,
         parentName,
         name,
         variant,
         supportedAnimations,
       };
       dynamicReplacements(itemToDraw)
       addCreditFor(itemToDraw.fileName, licenses, authors, urls, notes);
       itemsToDraw.push(itemToDraw);
     }
   } else {
     break;
   }
 }
});
loadItemsToDraw();
const creditsTxt = sheetCreditsToTxt();
$("textarea#creditsText").val(creditsTxt);
itemsMeta["credits"] = sheetCredits;

if (images["uploaded"] != null) {
 const itemToDraw = {};
 itemToDraw.fileName = "uploaded";
 itemToDraw.zPos = parseInt(document.getElementById("ZPOS").value) || 0;
 itemsToDraw.push(itemToDraw);
}
}

function resetLoading() {
imagesLoaded = 0;
imagesToLoad = 0;
didStartRenderAfterLoad = false;
}

function makeDynamicSubstitutions(fileName, $el, jdx) {
const mungedReplacements = $el.data(`layer_${jdx}_replace`);
if (mungedReplacements && fileName.includes('${')) {
 const replacements = mungedReplacements.replace(/'/g, '"');
 let parsedReplacements = null;
 try {
   parsedReplacements = JSON.parse(replacements);
 } catch {
   console.error("Error parsing template", replacements);
 }
 if (parsedReplacements) {
   const keys = Object.keys(parsedReplacements);
   const entries = keys.map(key => {
     const id = `${key}-${jHash.val(key)}`;
     let parent = 'none';
     if (document.getElementById(id)) {
       parent = getParent(id);
     }
     return [key, parsedReplacements[key][parent]];
   });
   const replObj = Object.fromEntries(entries);
   fileName = es6DynamicTemplate(fileName, replObj);
 }
}
return fileName;
}

function dynamicReplacements(itemToDraw) {
const { fileName, name, parentName, variant } = itemToDraw;
const el = document.getElementById(`${parentName}-${name}_${variant}`);
console.log('dynamic replacements');
itemToDraw.fileName = makeDynamicSubstitutions(fileName, $(el), 1);
}

function loadItemsToDraw() {
if (!canRender()) {
 return setTimeout(loadItemsToDraw, 100);
}
resetLoading();
let itemIdx = 0;
for (const item of itemsToDraw) {
 const supportedAnimations = item.supportedAnimations;
 const filePath = item.fileName;
 const custom_animation = item.custom_animation;
 if (custom_animation !== undefined) {
   loadImage(filePath, true);
 } else {
   const { directory, file } = splitFilePath(filePath);

   for (const [key, value] of Object.entries(base_animations)) {
     let animationToCheck = key;
     if (key === "combat_idle") {
       animationToCheck = "combat";
     } else if (key === "backslash") {
       animationToCheck = "1h_slash";
     } else if (key === "halfslash") {
       animationToCheck = "1h_halfslash";
     }
     if (supportedAnimations.includes(animationToCheck)) {
       const newFile = `${directory}/${key}/${file}`;
       loadImage(newFile, true);
     } else {
       // Enable this to see missing animations in the console
       if (DEBUG)
         console.warn(
           `supportedAnimations does not contain ${key} for asset ${file}. skipping render`
         );
     }
   }
 }
 itemIdx += 1;
}
}

/**
* * @param {CanvasRenderingContext2D} customAnimationContext 
* @param {CustomAnimationDefinition} customAnimationDefinition 
* @param {number} offSetY 
* @param {CanvasImageSource} src 
* @param {AnimationRowsLayout} srcRowsLayout 
*/
function drawFramesToCustomAnimation(customAnimationContext, customAnimationDefinition, offSetY, src, srcRowsLayout) {
const frameSize = customAnimationDefinition.frameSize;
for (let i = 0; i < customAnimationDefinition.frames.length; ++i) {
 const frames = customAnimationDefinition.frames[i];
 for (let j = 0; j < frames.length; ++j) {
   const srcColumn = parseInt(frames[j].split(",")[1]);
   const srcRowName = frames[j].split(",")[0];
   const srcRow = srcRowsLayout ? (srcRowsLayout[srcRowName] + 1) : i;

   drawFrameToFrame(customAnimationContext,
     {
       x: frameSize * j,
       y: frameSize * i + offSetY
     },
     frameSize,
     src,
     {
       x: universalFrameSize * srcColumn,
       y: universalFrameSize * srcRow,
     },
     universalFrameSize)
 }
}
}

function getItemAnimationImage(itemToDraw, animName) {
let animationToCheck = animName;
if (animName === "combat_idle") {
 animationToCheck = "combat";
} else if (animName === "backslash") {
 animationToCheck = "1h_slash";
} else if (animName === "halfslash") {
 animationToCheck = "1h_halfslash";
}
const supportedAnimations = itemToDraw.supportedAnimations;
if (supportedAnimations.includes(animationToCheck)) {
 const filePath = itemToDraw.fileName;
 const splitPath = splitFilePath(filePath);
 const newFile = `${splitPath.directory}/${animName}/${splitPath.file}`;
 return loadImage(newFile, false);
} else {
 if (DEBUG)
   console.log(`supportedAnimations does not contain ${animationToCheck} for asset ${itemToDraw.fileName}. skipping render`);
}
return null;
}

function drawItemOnStandardAnimation(destCtx, destY, animName, itemToDraw) {
const img = getItemAnimationImage(itemToDraw, animName);
if (img)
 destCtx.drawImage(img, 0, destY);
return img;
}

/**
* * @param {ItemToDraw[]} items 
* @returns {string[]}
*/
function buildCustomAnimationList(items) {
const list = [];
for (const item of items) {
 const customAnimationString = item.custom_animation;
 if (customAnimationString !== undefined) {
   if (!list.includes(customAnimationString)) {
     list.push(customAnimationString);
   }
 }
}
return list;
}

/**
* * @param {string[]} customAnimationList 
* @returns {{width:number, height:number}}
*/
function getTotalSheetSize(customAnimationList) {
let sheetHeight = universalSheetHeight;
let sheetWidth = universalSheetWidth;
for (const customAnimationString of customAnimationList) {
 const customAnimation = customAnimations[customAnimationString];
 const { width: customAnimationWidth, height: customAnimationHeight } =
   customAnimationSize(customAnimation)
 sheetWidth = Math.max(
   sheetWidth,
   customAnimationWidth
 );
 sheetHeight = sheetHeight + customAnimationHeight;
}
return { width: sheetWidth, height: sheetHeight };
}

function drawItemsToDraw() {
if (!canRender()) {
 return;
}
if (DEBUG) console.log(`Start drawItemsToDraw`);
ctx.clearRect(0, 0, canvas.width, canvas.height);

clearCustomAnimationPreviews();
addedCustomAnimations = buildCustomAnimationList(itemsToDraw);
const { width, height } = getTotalSheetSize(addedCustomAnimations);
canvas.width = width;
canvas.height = height;

itemsToDraw.sort(function (lhs, rhs) {
 return parseInt(lhs.zPos) - parseInt(rhs.zPos);
});
for (const itemToDraw of itemsToDraw) {
 dynamicReplacements(itemToDraw);
 drawItemSheet(canvas, itemToDraw, addedCustomAnimations);
}
addCustomAnimationPreviews();
}

function canRender() {
if (imagesLoaded >= imagesToLoad) {
 if (DEBUG)
   console.log(`Loaded all ${imagesToLoad} of ${imagesToLoad} assets`);
 return true;
} else {
 if (DEBUG)
   console.log(
     `Loading... Loaded ${imagesLoaded} of ${imagesToLoad} assets`
   );
 return false;
}
}

function showOrHideElements() {
const bodyType = getBodyTypeName();
const selectedAnims = getSelectedAnimations();
const allowedLicenses = getAllowedLicenses();
const promises = [];
const lists = new Set();

// only interested in tags if on a selected item
const selectedTags = new Set();
$("#chooser input[type=radio]:checked").each(function () {
 const tags = $(this).data("tags");
 tags && tags.split(",").forEach(tag =>
   selectedTags.add(tag)
 );
});

let hasUnsupported = false;
let hasProhibited = false;

$("#chooser li[data-required]").each(function (index) {
 let hasExcluded = false;
 let excludedText = '';

 // Toggle Required Body Type
 const $this = $(this);
 const dataRequired = $this.data("required");
 let display = true;
 if (dataRequired) {
   const requiredTypes = dataRequired.split(",");
   if (!requiredTypes.includes(bodyType)) {
     display = false;
   }
 }

 if (display) {
   // Toggle based on tags/required_tags
   const $firstButton = $this
     .find("input[type=radio][parentname]")
     .eq(0);
   if ($firstButton.length > 0) {
     const requiredTags = $this
       .find("input[type=radio]")
       .data("required_tags");
     requiredTags?.split(",")?.forEach(tag => {
       if (tag && !selectedTags.has(tag)) {
         display = false;
       }
     });
   }
 }

 if (display) {
   // Toggle based on tags/excluded_tags
   const $firstButton = $this
     .find("input[type=radio][parentname]")
     .eq(0);
   if ($firstButton.length > 0) {
     const excludedTags = $firstButton
       .data("excluded_tags");
     excludedTags?.split(",")?.forEach(tag => {
       if (tag && selectedTags.has(tag)) {
         hasExcluded = true;
         excludedText = `${$firstButton.attr("name")} is not allowed with ${tag}`;
       }
     });
   }
 }

 if (display) {
   // Filter by template
   const mungedTemplate = $this
     .find("input[type=radio]")
     .data("layer_1_template");
   if (mungedTemplate) {
     const template = mungedTemplate.replace(/'/g, '"');
     let parsedTemplate = null;
     try {
       parsedTemplate = JSON.parse(template);
     } catch {
       console.error("Error parsing template", template);
     }
     if (parsedTemplate) {
       const keys = Object.keys(parsedTemplate);
       for (const key of keys) {
         const requiredVals = Object.keys(parsedTemplate[key]);
         const prop = whichPropChecked(ids, key, requiredVals);
         if (prop === "ERROR") {
           display = false;
           break;
         }
       }
     }
   }
 }

 if (display) {
   // Toggle Required Animations
   const anims = $this.data("animations");
   if (anims && selectedAnims.length > 0) {
     const requiredAnimations = anims.split(",");
     for (const selectedAnim of selectedAnims) {
       if (!requiredAnimations.includes(selectedAnim)) {
         display = false;
         if (
           $this.find("input[type=radio]:checked:not([id*=none])")
             .length > 0
         ) {
           hasUnsupported = true;
         }
         break;
       }
     }
   }
 }

 // Display Result
 if (display) {
   promises.push($this.show().promise());
   lists.add($this);
 } else {
   $this.hide();
 }

 if (hasExcluded) {
   $this.find('.excluded-hide').each(function () { $(this).hide().attr('hidden', 'hidden'); });
   $this.find('.excluded-text').each(function () { $(this).show().attr('hidden', null).text(excludedText); });
 } else {
   $this.find('.excluded-hide').each(function () { $(this).show().attr('hidden', null); });
   $this.find('.excluded-text').each(function () { $(this).hide().attr('hidden', 'hidden').text(''); });
 }
});

$("input[type=radio]:not(.none)").each(function () {
 const $this = $(this);
 let display = true;

 // Toggle allowed licenses
 const bodyTypeName = getBodyTypeName();
 const licenses =
   $this.data(`layer_1_${bodyTypeName}_licenses`) ||
   $this.closest("li.variant-list").data(`${bodyTypeName}_licenses`);
 if (licenses !== undefined) {
   const licensesForAsset = licenses.split(",");
   if (
     !allowedLicenses.some((allowedLicense) =>
       licensesForAsset.includes(allowedLicense)
     )
   ) {
     display = false;
     if (this.checked) {
       hasProhibited = true;
     }
   }
 }

 // Toggle based on tags/required_tags
 const requiredTags = $this.data("required_tags");
 requiredTags?.split(",")?.forEach(tag => {
   if (tag && !selectedTags.has(tag)) {
     display = false;
   }
 });

 // Toggle based on tags/excluded_tags
 const excludedTags = $this.data("excluded_tags");
 excludedTags?.split(",")?.forEach(tag => {
   if (tag && selectedTags.has(tag)) {
     display = false;
   }
 });

 // Display Result
 if (display) {
   promises.push($this.parent().show().promise());
   lists.add($this);
 } else {
   $this.parent().hide();
 }
});

if (hasUnsupported) {
 $(".removeUnsupported").show();
} else {
 $(".removeUnsupported").hide();
}

if (hasProhibited) {
 $(".removeIncompatibleWithLicenses").show();
} else {
 $(".removeIncompatibleWithLicenses").hide();
}

if (promises.length > 0) {
 Promise.allSettled(promises).finally(() => {
   for (const $li of lists) {
     drawPreviews.call($li.get(0));
   }
 });
}
}

function interpretParams() {
$("#chooser input[type=radio]").each(function () {
 const words = $(this).attr("id").split("-");
 const initial = words[0];
 $(this).prop(
   "checked",
   $(this).attr("checked") || params[initial] === words[1]
 );
 const $parent = $(this).closest("li.variant-list");
 if ($parent.attr('open')) {
   drawPreviews.call($parent.get(0));
 }
});
}

function setParams() {
$("#chooser input[type=radio]:checked").each(function () {
 const words = $(this).attr("id").split("-");
 const initial = words[0];
 if (!$(this).attr("checked") || params[initial]) {
   params[initial] = words[1];
 }
});
jHash.val(params);
}

function setParamsFromImport(spritesheet) {
spritesheet.forEach((sprite) => {
 const { name, parentName, variant } = sprite;
 const assetType = name.replaceAll(" ", "_");
 const assetVariant = variant.replaceAll(" ", "_");
 const assetToSelect = parentName + "-" + assetType + "_" + assetVariant;
 $(`#${assetToSelect}`).prop("checked", true);
});
setParams();
}

function loadImage(imgRef, allowLoading) {
if (!allowLoading) {
 return images["spritesheets/" + imgRef];
}
const fullImgRef = "spritesheets/" + imgRef;
if (images[fullImgRef]) {
 imagesToLoad += 1;
 setTimeout(function () {
   imageLoadDone();
 }, 10);
 return images[fullImgRef];
} else if (!(fullImgRef in images)) {
 imagesToLoad += 1;
 if (DEBUG) console.log(`loading new image ${fullImgRef}`);
 const img = new Image();
 img.src = fullImgRef;
 img.onload = imageLoadDone;
 img.onerror = (event) => imageLoadError(event, fullImgRef);
 images[fullImgRef] = img;
 return img;
}
}

function imageLoadDone() {
imagesLoaded += 1;
if (!didStartRenderAfterLoad && canRender()) {
 didStartRenderAfterLoad = true;
 drawItemsToDraw();
}
}

function imageLoadError(event, imgRef) {
if (DEBUG)
 console.error("There was an error loading image:", event.target.src);
images[imgRef] = null;
imageLoadDone();
}

function getImage2(imgRef, callback, layers, prevctx) {
const fullImgRef = "spritesheets/" + imgRef;
if (imgRef && images[fullImgRef] && images[fullImgRef].complete) {
 callback(layers, prevctx);
 return images[fullImgRef];
} else if (imgRef && images[fullImgRef]) {
 images[fullImgRef].addEventListener("load", function () {
   callback(layers, prevctx);
 });
 return images[fullImgRef];
} else {
 let img = new Image();
 img.src = fullImgRef;
 images[fullImgRef] = img;
 img.addEventListener("load", function () {
   callback(layers, prevctx);
 });
 img.addEventListener("error", function (event) {
   if (DEBUG)
     console.error("There was an error loading image:", event.target.src);
   images[fullImgRef] = null;
 });
 return img;
}
}

function drawPreviews() {
const buttons = $(this)
 .find("input[type=radio]")
 .filter(function () {
   return $(this).is(":visible");
 })
 .toArray();
for (const button of buttons) {
 const $this = $(button);
 if (
   !$this.parent().hasClass("hasPreview") &&
   !$this.parent().hasClass("noPreview")
 ) {
   const prev = document.createElement("canvas");
   prev.setAttribute("width", universalFrameSize);
   prev.setAttribute("height", universalFrameSize);
   const prevctx = prev.getContext("2d");
   let img = null;
   const previewRow = parseInt($this.data("preview_row"));
   const previewColumn = parseInt($this.data("preview_column"));
   const previewXOffset = parseInt($this.data("preview_x_offset"));
   const previewYOffset = parseInt($this.data("preview_y_offset"));
   const callback = function (layers, prevctx) {
     for (index = 0; index < layers.length; index++) {
       if (!images["spritesheets/" + layers[index].link]) {
         return;
       }
     }
     try {
       const drawLayer = (layer) => {
         if (layer && layer.link) {
           try {
             const drawThisPreview = () => {
               prevctx.drawImage(
                 images["spritesheets/" + layer.link],
                 previewColumn * universalFrameSize + previewXOffset,
                 previewRow * universalFrameSize + previewYOffset,
                 universalFrameSize,
                 universalFrameSize,
                 0,
                 0,
                 universalFrameSize,
                 universalFrameSize
               );
             };
             if (images["spritesheets/" + layer.link].complete) {
               drawThisPreview();
             } else {
               images["spritesheets/" + layer.link].addEventListener(
                 "load",
                 drawThisPreview
               );
             }
           } catch (e) {
             if (DEBUG) console.error(e);
           }
         } else if (DEBUG) {
           console.error(`Preview link missing for ${$this.id}`);
         }
       };
       for (const layer of layers) {
         drawLayer(layer);
       }
     } catch (err) {
       if (DEBUG) console.error(err);
     }
   };

   const layers = [];
   const animation = $this.data(`layer_1_custom_animation`);
   const supportedAnimations = $this
     .closest("[data-animations]")
     .data("animations")
     .split(",");
   let defaultAnimation = "walk";
   if (
     supportedAnimations &&
     supportedAnimations.length &&
     !supportedAnimations.includes("walk")
   ) {
     defaultAnimation = supportedAnimations[0];
   }
   const bodyTypeName = getBodyTypeName();
   let imageLink = $this.data(`layer_1_${bodyTypeName}`);

   for (jdx = 1; jdx < 10; jdx++) {
     imageLink = $this.data(`layer_${jdx}_${bodyTypeName}`);
     if (imageLink) {
       imageLink = makeDynamicSubstitutions(imageLink, $this, jdx);

       // custom animations
       if (animation === $this.data(`layer_${jdx}_custom_animation`)) {
         const previewToDraw = {};
         previewToDraw.link = updatePreviewLink(
           imageLink,
           animation,
           defaultAnimation
         );
         previewToDraw.zPos = $this.data(`layer_${jdx}_zpos`);
         layers.push(previewToDraw);
       }
     } else {
       break;
     }
   }

   layers.sort(function (lhs, rhs) {
     return parseInt(lhs.zPos) - parseInt(rhs.zPos);
   });

   for (const layer of layers) {
     img = getImage2(layer.link, callback, layers, prevctx);
   }

   if (img && !$(button).parent().hasClass("hasPreview")) {
     button.parentNode.insertBefore(prev, button);
     $(button)
       .parent()
       .addClass("hasPreview")
       .parent()
       .addClass("hasPreview");
   }
 }
}
}

function nextFrame() {
const fpsInterval = 1000 / 8;
let now = Date.now();
let elapsed = now - past;
if (elapsed > fpsInterval) {
 past = now - (elapsed % fpsInterval);

 animCtx.clearRect(0, 0, anim.width, anim.height);
 currentAnimationItemIndex =
   (currentAnimationItemIndex + 1) % animationItems.length;
 const currentFrame = animationItems[currentAnimationItemIndex];
 let frameSize = universalFrameSize;
 let offSet = 0;
 if (activeCustomAnimation !== "") {
   const customAnimation = customAnimations[activeCustomAnimation];
   frameSize = customAnimation.frameSize;
   const indexInArray = addedCustomAnimations.indexOf(
     activeCustomAnimation
   );
   offSet = universalSheetHeight;
   for (let i = 0; i < indexInArray; ++i) {
     const otherCustomAction = customAnimations[addedCustomAnimations[i]];
     offSet +=
       otherCustomAction.frameSize * otherCustomAction.frames.length;
   }
 }
 for (let i = 0; i < animRowNum; ++i) {
   animCtx.drawImage(
     canvas,
     currentFrame * frameSize,
     offSet + (animRowStart + i) * frameSize,
     frameSize,
     frameSize,
     i * frameSize,
     0,
     frameSize,
     frameSize
   );
 }
}
requestAnimationFrame(nextFrame);
}

function updatePreviewLink(imageLink, customWalkAnimation, defaultAnimation) {
const { directory, file } = splitFilePath(imageLink);
if (customWalkAnimation) {
 imageLink = `${directory}/${file}`;
} else if (defaultAnimation) {
 imageLink = `${directory}/${defaultAnimation}/${file}`;
} else {
 imageLink = `${directory}/walk/${file}`;
}
if (DEBUG)
 console.log(
   "preview image:",
   `${window.location.protocol}//${window.location.host}/spritesheets/${imageLink}`
 );
return imageLink;
}

function splitFilePath(filePath) {
const index = filePath.lastIndexOf("/");
if (index > -1) {
 return {
   directory: filePath.substring(0, index),
   file: filePath.substring(index + 1),
 };
} else {
 throw new Error(
   `Could not split to directory and file using path ${filePath}`
 );
}
}

// ** START: NEW CATEGORY EXPORT UI FUNCTIONS **

// Rebuilds the category export UI to mirror the main chooser's hierarchy
function populateCategoryCheckboxes() {
const exportContainer = $("#category-export-container");
exportContainer.empty();

// Find top-level categories from the main chooser
$("#chooser > details > ul > li").each(function() {
   const mainCatLi = $(this);
   const mainCatName = mainCatLi.children("span").first().text().trim();

   if (!mainCatName) return;

   const details = $("<details class='export-category-group'></details>");
   const summary = $("<summary></summary>");
   const masterCheckbox = $('<input type="checkbox" class="master-checkbox">');
   
   summary.append(masterCheckbox).append(`<strong>${mainCatName}</strong>`);
   details.append(summary);

   const subContainer = $('<div class="subcategory-list"></div>');

   // Find subcategories within this main category
   mainCatLi.find("ul > li.variant-list").each(function() {
       const subCatLi = $(this);
       const subCatName = subCatLi.children("span").first().text().trim();
       const radioName = subCatLi.find("input[type=radio]").first().attr("name");

       if (radioName && subCatName) {
           const label = $("<label></label>");
           const checkbox = $(`<input type="checkbox" class="subcategory-checkbox" value="${radioName}">`);
           label.append(checkbox).append(` ${subCatName}`);
           subContainer.append(label);
       }
   });

   if (subContainer.children().length > 0) {
       details.append(subContainer);
       exportContainer.append(details);
   }
});

// Add event listeners for new UI
// Master checkbox controls its children
exportContainer.on("change", ".master-checkbox", function() {
   const $master = $(this);
   const isChecked = $master.is(":checked");
   $master.closest("details").find(".subcategory-checkbox").prop("checked", isChecked).trigger("change");
});

// Sub-checkboxes update their master
exportContainer.on("change", ".subcategory-checkbox", function() {
   const $details = $(this).closest("details");
   const $subCheckboxes = $details.find(".subcategory-checkbox");
   const $masterCheckbox = $details.find(".master-checkbox");

   const allChecked = $subCheckboxes.length === $subCheckboxes.filter(":checked").length;
   $masterCheckbox.prop("checked", allChecked);
   
   // Update main download button state
   const anyChecked = $("#category-export-container .subcategory-checkbox:checked").length > 0;
   $(".exportCategorySpritesheets").prop("disabled", !anyChecked);
});

// Initial state of download button
$(".exportCategorySpritesheets").prop("disabled", true);
}

// Polite queue for downloading images with controlled concurrency
async function downloadImagesWithConcurrency(urls, limit, onProgress) {
 const urlsToProcess = [...urls];
 let completed = 0;
 
 const worker = async () => {
     while(urlsToProcess.length > 0) {
         const url = urlsToProcess.pop();
         if (url) {
             try {
                 // Uses the async loader from drawItemSheetForExportAsync's scope
                 const loadImageAsync = (src) => new Promise((resolve, reject) => {
                     const fullSrc = "spritesheets/" + src;
                     if (images[fullSrc] && images[fullSrc].complete) return resolve(images[fullSrc]);
                     if (images[fullSrc]) {
                         images[fullSrc].onload = () => resolve(images[fullSrc]);
                         images[fullSrc].onerror = (err) => reject(err);
                         return;
                     }
                     const img = new Image();
                     img.onload = () => { images[fullSrc] = img; resolve(img); };
                     img.onerror = () => { images[fullSrc] = null; reject(new Error(`Failed to load: ${src}`)); };
                     img.src = fullSrc;
                 });
                 await loadImageAsync(url);
             } catch (error) {
                 console.warn(error.message);
             } finally {
                 completed++;
                 if (onProgress) onProgress(completed, urls.length);
             }
         }
     }
 };
 
 const workers = [];
 for(let i = 0; i < limit; i++) {
     workers.push(worker());
 }
 
 await Promise.all(workers);
}

// Refactored category export function
$(".exportCategorySpritesheets").click(async function () {
const $button = $(this);
const originalButtonText = $button.text();
$button.prop("disabled", true);

try {
 const selectedSubcategories = [];
 $("#category-export-container .subcategory-checkbox:checked").each(function () {
   selectedSubcategories.push($(this).val());
 });

 if (selectedSubcategories.length === 0) {
   alert("Please select at least one subcategory to export.");
   return;
 }
 
 const bodyType = getBodyTypeName();
 const allItemsToProcess = [];
 const imageUrls = new Set();
 
 // PHASE 1: Gather all item data and image URLs first
 for (const subCat of selectedSubcategories) {
   $(`#chooser input[type=radio][name="${subCat}"]`).each(function () {
     const $item = $(this);
     const parentName = $item.attr("parentName");
     const variant = $item.attr("variant");
     if (!parentName || !variant) return;

     const $liVariant = $item.closest("li.variant-list");
     const fileName = $item.data(`layer_1_${bodyType}`) || $liVariant.data(`layer_1_${bodyType}`) || "";
     if (!fileName) return;

     const supportedAnimations = $item.closest("[data-animations]").data("animations") || "";
     const itemData = { fileName, parentName, variant, supportedAnimations, subCat };
     allItemsToProcess.push(itemData);

     // Get image URLs for this item
     for (const animName of Object.keys(base_animations)) {
       let animCheck = animName;
       if (animName === "combat_idle") animCheck = "combat";
       if (animName === "backslash") animCheck = "1h_slash";
       if (animName === "halfslash") animCheck = "1h_halfslash";
       if (supportedAnimations.includes(animCheck)) {
           const { directory, file } = splitFilePath(fileName);
           imageUrls.add(`${directory}/${animName}/${file}`);
       }
     }
   });
 }
 
 // PHASE 2: Download all images with the polite queue
 const urls = Array.from(imageUrls);
 if (urls.length > 0) {
     await downloadImagesWithConcurrency(urls, 8, (completed, total) => {
         $button.text(`Loading ${completed} of ${total} images...`);
     });
 }
 
 // PHASE 3: Process and Zip (now that images are cached)
 $button.text("Zipping files...");
 const zip = new JSZip();
 const timestamp = newTimeStamp();
 let totalExported = 0;
 let totalFailed = 0;
 const failureDetails = [];
 
 for (const itemToDraw of allItemsToProcess) {
     try {
       const mainCategoryName = $(`input.subcategory-checkbox[value="${itemToDraw.subCat}"]`).closest("details").find("summary strong").text();
       const subCategoryName = $(`input.subcategory-checkbox[value="${itemToDraw.subCat}"]`).parent("label").text().trim();
       const mainFolder = zip.folder(mainCategoryName);
       const subFolder = mainFolder.folder(subCategoryName);

       const itemCanvas = document.createElement("canvas");
       itemCanvas.width = universalSheetWidth;
       itemCanvas.height = universalSheetHeight;

       await drawItemSheetForExportAsync(itemCanvas, itemToDraw, addedCustomAnimations || []);

       const blob = await canvasToBlob(itemCanvas);
       const pngFileName = `${itemToDraw.variant}.png`;

       if (blob) {
           subFolder.file(pngFileName, blob);
           totalExported++;
       } else {
           totalFailed++;
           failureDetails.push(`${subCategoryName}: Failed blob for ${itemToDraw.variant}`);
       }
     } catch(err) {
         totalFailed++;
         failureDetails.push(`Error exporting ${itemToDraw.variant}: ${err.message}`);
     }
 }

 if (totalExported > 0) {
   const zipFileName = `categories_export_${timestamp}.zip`;
   await downloadZip(zip, zipFileName);
 }

 let message = `Export completed!\nSuccessfully exported: ${totalExported} spritesheets`;
 if (totalFailed > 0) {
   message += `\nFailed: ${totalFailed} spritesheets`;
   if (failureDetails.length > 0) message += `\n\nDetails:\n${failureDetails.join('\n')}`;
 } else if (totalExported === 0) {
   message = 'No valid items found or rendered for the selected categories.';
   if (failureDetails.length > 0) message += `\n\nDetails:\n${failureDetails.join('\n')}`;
 }
 alert(message);

} catch (error) {
 console.error('Category export error:', error);
 alert(`Export failed: ${error.message}`);
} finally {
 $button.text(originalButtonText);
 // Re-enable based on checkbox state, not just blindly
 const anyChecked = $("#category-export-container .subcategory-checkbox:checked").length > 0;
 $button.prop("disabled", !anyChecked);
}
});

// ** END: NEW CATEGORY EXPORT UI FUNCTIONS **

// Call this function when the page loads after the initial UI setup is complete.
populateCategoryCheckboxes();
});