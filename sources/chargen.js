/**
 * @typedef {{
*   fileName: string,
*   zPos: number,
*   custom_animation: string?,
*   parentName: string,
*   name: string,
*   variant: string,
*   supportedAnimations: string
* }} ItemToDraw
* @typedef {{
*   bodyTypeName: string,
*   url: string,
*   spritesheets: string,
*   version: number,
*   datetime: string,
*   credits: string[],
* }} ItemsMeta  
*/

$.expr[":"].icontains = function (a, i, m) {
   return jQuery(a).text().toUpperCase().indexOf(m[3].toUpperCase()) >= 0;
};

const es6DynamicTemplate = (templateString, templateVariables) =>
   templateString.replace(/\${(.*?)}/g, (_, g) => templateVariables[g]);

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
   let itemsToDraw = [];
   let itemsMeta = {};
   let params = jHash.val();
   let sheetCredits = [];
   let isRendering = false;

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
       spellcast: 7, thrust: 8, walk: 9, slash: 6, shoot: 13, hurt: 6, climb: 6,
       idle: 2, jump: 5, sit: 3, emote: 3, run: 8, combat_idle: 2, backslash: 13, halfslash: 7
   };

   const sexes = ["male", "female", "teen", "child", "muscular", "pregnant"];
   const allElements = document.querySelectorAll("#chooser [id][type=radio]");
   const ids = Array.prototype.map.call(allElements, (el) => el.id);

   const getBodyTypeName = () => whichPropCheckedExact("sex", sexes);

   let past = Date.now();
   const anim = $("#previewAnimations").get(0);
   const animCtx = anim.getContext("2d");
   let animationItems = [1, 2, 3, 4, 5, 6, 7, 8];
   let animRowStart = 8;
   let animRowNum = 4;
   let currentAnimationItemIndex = 0;
   let activeCustomAnimation = "";
   let addedCustomAnimations = [];

   const customAnimations = {};
   const animationRowsLayout = {};

   // =========================================================================
   // CORE UTILITY FUNCTIONS
   // =========================================================================

   function loadImage(src) {
       if (!src) return Promise.resolve(null);
       const fullSrc = "spritesheets/" + src;

       if (images[fullSrc]) return images[fullSrc];

       const promise = new Promise((resolve) => {
           const img = new Image();
           img.onload = () => resolve(img);
           img.onerror = () => {
               if (DEBUG) console.error(`Failed to load image: ${fullSrc}`);
               resolve(null);
           };
           img.src = fullSrc;
       });

       images[fullSrc] = promise;
       return promise;
   }

   function getSafeData($element, key, defaultValue = '') {
       const value = $element.data(key);
       return value !== undefined && value !== null ? value : defaultValue;
   }

   function safeDrawImage(ctx, img, dx, dy, dWidth, dHeight, sx, sy, sWidth, sHeight) {
       if (!ctx || !img) return false;
       try {
           if (img.width === 0 || img.height === 0) return false;
           if (sx < 0 || sy < 0 || sx + sWidth > img.width || sy + sHeight > img.height) return false;
           ctx.drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
           return true;
       } catch (error) {
           console.error('Error drawing image:', error);
           return false;
       }
   }

   // =========================================================================
   // MAIN APPLICATION LOGIC
   // =========================================================================

   function showOrHideElements() {
       const bodyType = getBodyTypeName();
       const selectedAnims = getSelectedAnimations();
       const allowedLicenses = getAllowedLicenses();
       const promises = [];
       const lists = new Set();
       const selectedTags = new Set();

       $("#chooser input[type=radio]:checked").each(function () {
           const tags = $(this).data("tags");
           tags && tags.split(",").forEach(tag => selectedTags.add(tag));
       });

       let hasUnsupported = false;
       let hasProhibited = false;

       $("#chooser li[data-required]").each(function () {
           let hasExcluded = false;
           let excludedText = '';
           const $this = $(this);
           const dataRequired = $this.data("required");
           let display = true;

           if (dataRequired) {
               const requiredTypes = dataRequired.split(",");
               if (!requiredTypes.includes(bodyType)) display = false;
           }

           const $firstButton = $this.find("input[type=radio][parentname]").first();
           if (display && $firstButton.length > 0) {
               const requiredTags = $firstButton.data("required_tags");
               requiredTags?.split(",")?.forEach(tag => {
                   if (tag && !selectedTags.has(tag)) display = false;
               });
           }

           if (display && $firstButton.length > 0) {
               const excludedTags = $firstButton.data("excluded_tags");
               excludedTags?.split(",")?.forEach(tag => {
                   if (tag && selectedTags.has(tag)) {
                       hasExcluded = true;
                       excludedText = `${$firstButton.attr("name")} is not allowed with ${tag}`;
                   }
               });
           }

           if (display) {
               const mungedTemplate = $firstButton.data("layer_1_template");
               if (mungedTemplate) {
                   const template = mungedTemplate.replace(/'/g, '"');
                   try {
                       const parsedTemplate = JSON.parse(template);
                       const keys = Object.keys(parsedTemplate);
                       for (const key of keys) {
                           const requiredVals = Object.keys(parsedTemplate[key]);
                           const prop = whichPropChecked(ids, key, requiredVals);
                           if (prop === "ERROR") {
                               display = false;
                               break;
                           }
                       }
                   } catch (e) {
                       console.error("Error parsing template", template, e);
                   }
               }
           }

           if (display) {
               const anims = $this.data("animations");
               if (anims && selectedAnims.length > 0) {
                   const requiredAnimations = anims.split(",");
                   for (const selectedAnim of selectedAnims) {
                       if (!requiredAnimations.includes(selectedAnim)) {
                           display = false;
                           if ($this.find("input[type=radio]:checked:not([id*=none])").length > 0) hasUnsupported = true;
                           break;
                       }
                   }
               }
           }

           if (display) {
               promises.push($this.show().promise());
               lists.add($this.get(0));
           } else $this.hide();

           const $excludedHideElements = $this.find('.excluded-hide');
           const $excludedTextElements = $this.find('.excluded-text');
           if (hasExcluded) {
               $excludedHideElements.hide().attr('hidden', 'hidden');
               $excludedTextElements.show().attr('hidden', null).text(excludedText);
           } else {
               $excludedHideElements.show().attr('hidden', null);
               $excludedTextElements.hide().attr('hidden', 'hidden').text('');
           }
       });

       $("input[type=radio]:not(.none)").each(function () {
           const $this = $(this);
           let display = true;
           const licenses = $this.data(`layer_1_${bodyType}_licenses`) || $this.closest("li.variant-list").data(`${bodyType}_licenses`);
           
           if (licenses !== undefined) {
               const licensesForAsset = licenses.split(",");
               if (!allowedLicenses.some((allowedLicense) => licensesForAsset.includes(allowedLicense))) {
                   display = false;
                   if (this.checked) hasProhibited = true;
               }
           }

           const requiredTags = $this.data("required_tags");
           requiredTags?.split(",")?.forEach(tag => { if (tag && !selectedTags.has(tag)) display = false; });

           const excludedTags = $this.data("excluded_tags");
           excludedTags?.split(",")?.forEach(tag => { if (tag && selectedTags.has(tag)) display = false; });

           const $parentLabel = $this.parent();
           if (display) {
               promises.push($parentLabel.show().promise());
               lists.add($this.closest('li.variant-list').get(0));
           } else $parentLabel.hide();
       });

       $(".removeUnsupported").toggle(hasUnsupported);
       $(".removeIncompatibleWithLicenses").toggle(hasProhibited);

       if (promises.length > 0) {
           Promise.allSettled(promises).finally(() => {
               for (const liElement of lists) drawPreviews.call(liElement);
           });
       }
   }

   function interpretParams() {
       $("#chooser input[type=radio]").each(function () {
           const words = $(this).attr("id").split("-");
           const initial = words[0];
           $(this).prop("checked", $(this).attr("checked") || params[initial] === words[1]);
           const $parent = $(this).closest("li.variant-list");
           if ($parent.attr('open')) drawPreviews.call($parent.get(0));
       });
   }

   function setParams() {
       $("#chooser input[type=radio]:checked").each(function () {
           const words = $(this).attr("id").split("-");
           const initial = words[0];
           if (!$(this).attr("checked") || params[initial]) params[initial] = words[1];
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

   // =========================================================================
   // PREVIEW AND ANIMATION SYSTEM
   // =========================================================================

   async function drawPreviews() {
       const visibleButtons = $(this).find("input[type=radio]:visible").toArray();
       for (const button of visibleButtons) {
           const $button = $(button);
           const $parentLabel = $button.parent();
           if ($parentLabel.hasClass("hasPreview") || $parentLabel.hasClass("noPreview")) continue;

           const layers = [];
           const bodyTypeName = getBodyTypeName();
           for (let jdx = 1; jdx < 10; jdx++) {
               let imageLink = $button.data(`layer_${jdx}_${bodyTypeName}`);
               if (!imageLink) break;
               imageLink = makeDynamicSubstitutions(imageLink, $button, jdx);
               const animation = $button.data(`layer_1_custom_animation`);
               if (animation === $button.data(`layer_${jdx}_custom_animation`)) {
                   const supportedAnimations = $button.closest("[data-animations]").data("animations")?.split(",") || [];
                   let defaultAnimation = "walk";
                   if (supportedAnimations.length && !supportedAnimations.includes("walk")) defaultAnimation = supportedAnimations[0];
                   layers.push({ link: updatePreviewLink(imageLink, animation, defaultAnimation), zPos: $button.data(`layer_${jdx}_zpos`) });
               }
           }
           if (layers.length === 0) continue;
           layers.sort((a, b) => parseInt(a.zPos) - parseInt(b.zPos));
           const prevCanvas = document.createElement("canvas");
           prevCanvas.width = universalFrameSize;
           prevCanvas.height = universalFrameSize;
           const prevCtx = prevCanvas.getContext("2d");
           try {
               const previewRow = parseInt($button.data("preview_row")) || 0;
               const previewColumn = parseInt($button.data("preview_column")) || 0;
               const previewXOffset = parseInt($button.data("preview_x_offset")) || 0;
               const previewYOffset = parseInt($button.data("preview_y_offset")) || 0;
               for (const layer of layers) {
                   const img = await loadImage(layer.link);
                   if (img) safeDrawImage(prevCtx, img, 0, 0, universalFrameSize, universalFrameSize, previewColumn * universalFrameSize + previewXOffset, previewRow * universalFrameSize + previewYOffset, universalFrameSize, universalFrameSize);
               }
               button.parentNode.insertBefore(prevCanvas, button);
               $parentLabel.addClass("hasPreview");
               $parentLabel.parent().addClass("hasPreview");
           } catch (e) {
               if (DEBUG) console.error("Error drawing preview for:", $button.attr('id'), e);
               $parentLabel.addClass("noPreview");
           }
       }
   }

   function nextFrame() {
       const fpsInterval = 1000 / 8;
       let now = Date.now();
       let elapsed = now - past;
       if (elapsed > fpsInterval) {
           past = now - (elapsed % fpsInterval);
           try {
               animCtx.clearRect(0, 0, anim.width, anim.height);
               currentAnimationItemIndex = (currentAnimationItemIndex + 1) % animationItems.length;
               const currentFrame = animationItems[currentAnimationItemIndex];
               if (currentFrame < 0 || currentFrame >= animationItems.length) currentAnimationItemIndex = 0;
               let frameSize = universalFrameSize;
               let offSet = 0;
               if (activeCustomAnimation !== "") {
                   const customAnimation = customAnimations[activeCustomAnimation];
                   if (customAnimation) {
                       frameSize = customAnimation.frameSize || universalFrameSize;
                       const indexInArray = addedCustomAnimations.indexOf(activeCustomAnimation);
                       offSet = universalSheetHeight;
                       for (let i = 0; i < indexInArray; ++i) {
                           const otherCustomAction = customAnimations[addedCustomAnimations[i]];
                           if (otherCustomAction) offSet += otherCustomAction.frameSize * (otherCustomAction.frames?.length || 0);
                       }
                   }
               }
               for (let i = 0; i < animRowNum; ++i) safeDrawImage(animCtx, canvas, i * frameSize, 0, frameSize, frameSize, currentFrame * frameSize, offSet + (animRowStart + i) * frameSize, frameSize, frameSize);
           } catch (error) {
               console.error('Error in animation frame:', error);
           }
       }
       requestAnimationFrame(nextFrame);
   }

   function updatePreviewLink(imageLink, customWalkAnimation, defaultAnimation) {
       const { directory, file } = splitFilePath(imageLink);
       if (customWalkAnimation) imageLink = `${directory}/${file}`;
       else if (defaultAnimation) imageLink = `${directory}/${defaultAnimation}/${file}`;
       else imageLink = `${directory}/walk/${file}`;
       if (DEBUG) console.log("preview image:", `${window.location.protocol}//${window.location.host}/spritesheets/${imageLink}`);
       return imageLink;
   }

   function splitFilePath(filePath) {
       const index = filePath.lastIndexOf("/");
       if (index > -1) return { directory: filePath.substring(0, index), file: filePath.substring(index + 1) };
       else throw new Error(`Could not split to directory and file using path ${filePath}`);
   }

   // =========================================================================
   // CATEGORY EXPORT SYSTEM (FULLY INTEGRATED)
   // =========================================================================

   function updateButtonState() {
       const anyChecked = $("#category-export-container .variant-checkbox:checked").length > 0;
       $(".exportCategorySpritesheets").prop("disabled", !anyChecked);
   }

   async function buildExportTreeLevel($sourceUl, $destContainer, path) {
       const children = $sourceUl.children("li");
       for (const li of children) {
           const $li = $(li);
           const $span = $li.children("span").first();
           const name = $span.text().trim();
           const $nestedUl = $li.children("ul").first();
           if (!name) continue;

           if ($li.hasClass('variant-list')) {
               const $radios = $li.find('input[type=radio]');
               if ($radios.length > 0) {
                   const currentPath = [...path, name];
                   const finalPath = currentPath.join('/');
                   const $details = $("<details class='export-category-group'></details>");
                   const $summary = $("<summary></summary>");
                   const $masterCheckbox = $('<input type="checkbox" class="master-checkbox">');
                   $summary.append($masterCheckbox).append(`<strong>${name}</strong>`);
                   $details.append($summary);
                   const $variantContainer = $('<div class="variant-list"></div>');
                   $radios.each(function() {
                       const $radio = $(this);
                       const color = $radio.attr('variant');
                       const radioId = $radio.attr('id');
                       if (!color || color === 'none' || !radioId) return;
                       const $label = $('<label></label>');
                       const $checkbox = $(`<input type="checkbox" class="variant-checkbox">`);
                       $checkbox.attr('data-path', finalPath);
                       $checkbox.attr('data-radio-id', radioId);
                       $label.append($checkbox).append(` ${color}`);
                       $variantContainer.append($label);
                   });
                   $details.append($variantContainer);
                   $destContainer.append($details);
               }
           } else if ($nestedUl.length > 0) {
               const currentPath = [...path, name];
               const $details = $("<details class='export-category-group'></details>");
               const $summary = $("<summary></summary>");
               const $masterCheckbox = $('<input type="checkbox" class="master-checkbox">');
               $summary.append($masterCheckbox).append(`<strong>${name}</strong>`);
               $details.append($summary);
               const $subContainer = $('<div class="subcategory-list"></div>');
               await buildExportTreeLevel($nestedUl, $subContainer, currentPath);
               if ($subContainer.children().length > 0) {
                   $details.append($subContainer);
                   $destContainer.append($details);
               }
           }
           await new Promise(resolve => setTimeout(resolve, 0));
       }
   }

   async function populateCategoryCheckboxes() {
       const exportContainer = $("#category-export-container");
       if (exportContainer.length === 0) return;
       exportContainer.empty();
       const $rootUl = $("#chooser > details > ul");
       if ($rootUl.length > 0) await buildExportTreeLevel($rootUl, exportContainer, []);
       exportContainer.on("change", "input[type=checkbox]", function(e) {
           e.stopPropagation();
           const $changed = $(this);
           const isChecked = $changed.is(':checked');
           if ($changed.hasClass('master-checkbox')) $changed.closest('details').find('input[type=checkbox]').prop('checked', isChecked);
           $changed.parents('details').each(function() {
               const $details = $(this);
               const $children = $details.find('.variant-checkbox');
               const $master = $details.find('> summary > .master-checkbox');
               const allChecked = $children.length > 0 && $children.length === $children.filter(':checked').length;
               $master.prop('checked', allChecked);
           });
           updateButtonState();
       });
       updateButtonState();
   }

   async function downloadImagesWithConcurrency(urls, limit, onProgress) {
       const urlsToProcess = [...urls];
       let completed = 0;
       const worker = async () => {
           while(urlsToProcess.length > 0) {
               const url = urlsToProcess.pop();
               if (url) {
                   try { await loadImage(url); } catch (error) { console.warn(error.message); } 
                   finally { completed++; if (onProgress) onProgress(completed, urls.length); }
               }
           }
       };
       const workers = [];
       for(let i = 0; i < limit; i++) workers.push(worker());
       await Promise.all(workers);
   }

   $(".exportCategorySpritesheets").click(async function () {
       const $button = $(this);
       const originalButtonText = $button.text();
       $button.prop("disabled", true);
       try {
           const masterPlan = [];
           const bodyType = getBodyTypeName();
           $("#category-export-container .variant-checkbox:checked").each(function () {
               const $checkbox = $(this);
               const radioId = $checkbox.data('radio-id');
               if (!radioId) return;
               const radioElement = document.getElementById(radioId);
               if (!radioElement) { console.warn(`Could not find radio button with ID: ${radioId}`); return; }
               const $radio = $(radioElement);
               const $liVariant = $radio.closest("li.variant-list");
               const fileName = $radio.data(`layer_1_${bodyType}`) || $liVariant.data(`layer_1_${bodyType}`) || "";
               if (!fileName) { console.warn(`No fileName found for radio ID: ${radioId}`); return; }
               masterPlan.push({ path: $checkbox.data('path'), variant: $radio.attr('variant'), fileName: fileName, supportedAnimations: $radio.closest("[data-animations]").data("animations") || "" });
           });

           if (masterPlan.length === 0) { alert("Please select at least one item variant to export."); return; }
           const imageUrls = new Set();
           for(const item of masterPlan) {
               if (!item.fileName) continue;
               for (const animName of Object.keys(base_animations)) {
                   let animCheck = animName;
                   if (animName === "combat_idle") animCheck = "combat";
                   if (animName === "backslash") animCheck = "1h_slash";
                   if (animName === "halfslash") animCheck = "1h_halfslash";
                   if (item.supportedAnimations.includes(animCheck)) {
                       try { const { directory, file } = splitFilePath(item.fileName); imageUrls.add(`${directory}/${animName}/${file}`); } 
                       catch (err) { console.warn(`Could not split path for ${item.fileName}:`, err); }
                   }
               }
           }
           const urls = Array.from(imageUrls);
           if (urls.length > 0) await downloadImagesWithConcurrency(urls, 8, (completed, total) => { $button.text(`Loading ${completed} of ${total} images...`); });
           const zip = new JSZip();
           const timestamp = newTimeStamp();
           let totalExported = 0, totalFailed = 0, processedCount = 0;
           for (const itemToDraw of masterPlan) {
               if (!itemToDraw.fileName) continue;
               try {
                   processedCount++;
                   $button.text(`Creating spritesheets (${processedCount}/${masterPlan.length})...`);
                   await new Promise(resolve => setTimeout(resolve, 0));
                   const itemCanvas = document.createElement("canvas");
                   itemCanvas.width = universalSheetWidth;
                   itemCanvas.height = universalSheetHeight;
                   await drawItemSheetForExportAsync(itemCanvas, itemToDraw, addedCustomAnimations || []);
                   const blob = await canvasToBlob(itemCanvas);
                   const pngFileName = `${itemToDraw.variant}.png`;
                   let currentFolder = zip;
                   const pathParts = itemToDraw.path.split('/');
                   pathParts.forEach(part => { if (part) currentFolder = currentFolder.folder(part); });
                   if (blob) { currentFolder.file(pngFileName, blob); totalExported++; } 
                   else { totalFailed++; console.error(`Failed to create blob for ${itemToDraw.variant}`); }
               } catch(err) { totalFailed++; console.error(`Failed to process item ${itemToDraw.variant}:`, err); }
           }
           if (totalExported > 0) {
               $button.text("Creating ZIP file...");
               const zipFileName = `lpc_export_${timestamp}.zip`;
               await downloadZip(zip, zipFileName);
           }
           let message = `Export completed!\nSuccessfully exported: ${totalExported} spritesheets`;
           if (totalFailed > 0) message += `\nFailed to process: ${totalFailed} spritesheets`;
           alert(message);
       } catch (error) {
           console.error('Category export error:', error);
           alert(`Export failed: ${error.message}\nCheck console for details.`);
       } finally {
           $button.text(originalButtonText);
           updateButtonState();
       }
   });

   // =========================================================================
   // UTILITY FUNCTIONS
   // =========================================================================

   function makeDynamicSubstitutions(fileName, $el, jdx) {
       if (!fileName || !$el) return fileName;
       const mungedReplacements = getSafeData($el, `layer_${jdx}_replace`);
       if (mungedReplacements && fileName.includes('${')) {
           try {
               const replacements = mungedReplacements.replace(/'/g, '"');
               const parsedReplacements = JSON.parse(replacements);
               if (parsedReplacements && typeof parsedReplacements === 'object') {
                   const keys = Object.keys(parsedReplacements);
                   const entries = keys.map(key => {
                       const id = `${key}-${jHash.val(key)}`;
                       let parent = 'none';
                       const element = document.getElementById(id);
                       if (element) parent = getParent(id) || 'none';
                       const replacementValue = parsedReplacements[key]?.[parent] || '';
                       return [key, replacementValue];
                   });
                   const replObj = Object.fromEntries(entries);
                   fileName = es6DynamicTemplate(fileName, replObj);
               }
           } catch (error) { console.error("Error parsing template", mungedReplacements, error); }
       }
       return fileName;
   }

   function getParent(id) { const el = document.getElementById(id); return el ? el.getAttribute("parentname") : null; }
   function whichPropChecked(ids, key, vals) {
       const regExps = vals.map(val => new RegExp(String.raw`^${key}-${val}`, "i"));
       const els = findIdsByRegExp(ids, regExps);
       for (let i = 0; i < vals.length; ++i) if (els[i] === true) return vals[i];
       return "ERROR";
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
                   if (el && el.checked) { els[i] = true; return els; }
               }
           }
       }
       return els;
   }
   function whichPropCheckedExact(key, vals) {
       for (const val of vals) { const el = document.getElementById(`${key}-${val}`); if (el && el.checked) return val; }
       return "ERROR";
   }
   function getSelectedAnimations() {
       const $anims = $("[name=animation]:checked");
       if ($anims.length > 0) return $anims.map(function () { return this.id.replace("animation-", ""); }).get();
       return [];
   }
   function getAllowedLicenses() {
       return $(".licenseCheckBox:checkbox:checked").map(function () { return $(this).val().split(","); }).get().map((license) => license.trim());
   }

   async function drawItemSheetForExportAsync(destCanvas, itemToDraw, addedCustomAnimations) {
       const destCtx = destCanvas.getContext("2d");
       if (!destCtx) return;
       const custom_animation = itemToDraw.custom_animation;
       if (custom_animation !== undefined) {
           try {
               const img = await loadImage(itemToDraw.fileName);
               if (img) {
                   const y = customAnimationY(custom_animation, addedCustomAnimations);
                   safeDrawImage(destCtx, img, 0, y, destCanvas.width, destCanvas.height - y, 0, 0, img.width, img.height);
               }
           } catch (error) { console.warn(`Could not draw custom animation for ${itemToDraw.fileName}:`, error); }
       } else {
           for (const [animName, yOffset] of Object.entries(base_animations)) {
               let animationToCheck = animName;
               if (animName === "combat_idle") animationToCheck = "combat";
               if (animName === "backslash") animationToCheck = "1h_slash";
               if (animName === "halfslash") animationToCheck = "1h_halfslash";
               if (itemToDraw.supportedAnimations.includes(animationToCheck)) {
                   const { directory, file } = splitFilePath(itemToDraw.fileName);
                   const imagePath = `${directory}/${animName}/${file}`;
                   try {
                       const img = await loadImage(imagePath);
                       if (img) safeDrawImage(destCtx, img, 0, yOffset, img.width, img.height, 0, 0, img.width, img.height);
                   } catch (error) { if (DEBUG) console.warn(`Skipping animation "${animName}" for ${file}:`, error.message); }
               }
           }
       }
   }

   function customAnimationY(custom_animation, addedCustomAnimations) {
       const index = addedCustomAnimations.indexOf(custom_animation);
       return index >= 0 ? universalSheetHeight + (index * universalFrameSize * 10) : universalSheetHeight;
   }

   const canvasToBlob = (canvas) => new Promise((resolve, reject) => {
       try { canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Failed to create blob from canvas")), 'image/png'); } 
       catch (err) { reject(new Error(`Canvas to Blob conversion failed: ${err.message}`)); }
   });

   const newTimeStamp = () => new Date().toISOString().replace(/[:\.]/g, '-').substring(0, 19);

   async function downloadZip(zip, filename) {
       let blobUrl = null;
       try {
           const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
           blobUrl = URL.createObjectURL(content);
           const link = document.createElement('a');
           link.download = filename;
           link.href = blobUrl;
           link.style.display = 'none';
           document.body.appendChild(link);
           link.click();
           document.body.removeChild(link);
           return true;
       } catch (err) {
           console.error('Failed to generate zip file:', err);
           throw new Error(`Failed to generate zip file: ${err.message}`);
       } finally { if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 1000); }
   }

   // =========================================================================
   // ASYNC DRAWING PIPELINE
   // =========================================================================

   async function redraw() {
       itemsToDraw = [];
       const bodyTypeName = getBodyTypeName();

       sheetCredits = [];
       const baseUrl = window.location.href.split("/").slice(0, -1).join("/");

       itemsMeta = {
           bodyTypeName: bodyTypeName,
           url: window.location.href,
           spritesheets: baseUrl + "/spritesheets/",
           version: 1,
           datetime: new Date().toLocaleString(),
           credits: "",
       };

       $("#chooser input[type=radio]:checked").each(function (index) {
           const $this = $(this);
           for (let jdx = 1; jdx < 10; jdx++) {
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
                       const supportedAnimations = $this.closest("[data-animations]").data("animations");
                       const itemToDraw = { fileName, zPos, custom_animation, parentName, name, variant, supportedAnimations };
                       dynamicReplacements(itemToDraw);
                       addCreditFor(itemToDraw.fileName, licenses, authors, urls, notes);
                       itemsToDraw.push(itemToDraw);
                   }
               } else break;
           }
       });
       
       await loadAndDrawAllItems();
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

   function dynamicReplacements(itemToDraw) {
       const { fileName, name, parentName, variant } = itemToDraw;
       const el = document.getElementById(`${parentName}-${name}_${variant}`);
       if (el) itemToDraw.fileName = makeDynamicSubstitutions(fileName, $(el), 1);
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

   function sheetCreditsToTxt() {
       let creditString = "";
       sheetCredits.map(function (credit) {
           if (credit.licenses !== undefined) {
               const licensesForDisplay = `- Licenses:\n\t\t- ${credit.licenses.replaceAll(",", "\n\t\t- ")}`;
               const authorsForDisplay = `- Authors:\n\t\t- ${credit.authors.replaceAll(",", "\n\t\t- ")}`;
               const linksForDisplay = `- Links:\n\t\t- ${credit.urls.replaceAll(",", "\n\t\t- ")}`;
               const notesForDisplay = `- Note: ${credit.notes}`;
               let creditEntry = `${credit.fileName}\n\t${notesForDisplay}\n\t${licensesForDisplay}\n\t${authorsForDisplay}\n\t${linksForDisplay}\n\n`;
               creditString += creditEntry;
           }
       });
       return creditString;
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

   async function loadAndDrawAllItems() {
       const imagePromises = [];
       for (const item of itemsToDraw) {
           const { fileName, supportedAnimations, custom_animation } = item;
           if (custom_animation !== undefined) imagePromises.push(loadImage(fileName));
           else {
               const { directory, file } = splitFilePath(fileName);
               for (const key of Object.keys(base_animations)) {
                   let animationToCheck = key;
                   if (key === "combat_idle") animationToCheck = "combat";
                   else if (key === "backslash") animationToCheck = "1h_slash";
                   else if (key === "halfslash") animationToCheck = "1h_halfslash";
                   if (supportedAnimations.includes(animationToCheck)) {
                       const newFile = `${directory}/${key}/${file}`;
                       imagePromises.push(loadImage(newFile));
                   }
               }
           }
       }
       await Promise.all(imagePromises);
       await drawItemsToDraw();
   }

   async function drawItemsToDraw() {
       if (isRendering) return;
       isRendering = true;
       try {
           if (DEBUG) console.log(`Start drawItemsToDraw`);
           ctx.clearRect(0, 0, canvas.width, canvas.height);
           clearCustomAnimationPreviews();
           addedCustomAnimations = buildCustomAnimationList(itemsToDraw);
           const { width, height } = getTotalSheetSize(addedCustomAnimations);
           canvas.width = width;
           canvas.height = height;
           itemsToDraw.sort(function (lhs, rhs) { return parseInt(lhs.zPos) - parseInt(rhs.zPos); });
           for (const itemToDraw of itemsToDraw) {
               dynamicReplacements(itemToDraw);
               await drawItemSheet(canvas, itemToDraw, addedCustomAnimations);
           }
           addCustomAnimationPreviews();
       } catch (error) { console.error('Error in drawItemsToDraw:', error); } 
       finally { isRendering = false; }
   }

   function buildCustomAnimationList(items) {
       const list = [];
       for (const item of items) {
           const customAnimationString = item.custom_animation;
           if (customAnimationString !== undefined && !list.includes(customAnimationString)) list.push(customAnimationString);
       }
       return list;
   }

   function getTotalSheetSize(customAnimationList) {
       let sheetHeight = universalSheetHeight;
       let sheetWidth = universalSheetWidth;
       for (const customAnimationString of customAnimationList) {
           const customAnimation = customAnimations[customAnimationString];
           const { width: customAnimationWidth, height: customAnimationHeight } = customAnimationSize(customAnimation);
           sheetWidth = Math.max(sheetWidth, customAnimationWidth);
           sheetHeight = sheetHeight + customAnimationHeight;
       }
       return { width: sheetWidth, height: sheetHeight };
   }

   function customAnimationSize(customAnim) {
       if (!customAnim || !customAnim.frameSize || !customAnim.frames) return { width: universalFrameSize, height: universalFrameSize };
       const frameSize = customAnim.frameSize;
       const width = customAnim.frames[0] ? customAnim.frames[0].length * frameSize : frameSize;
       const height = customAnim.frames.length * frameSize;
       return { width, height };
   }

   function customAnimationBase(customAnim) {
       return customAnim && customAnim.base ? customAnim.base : "walk";
   }

   function clearCustomAnimationPreviews() {
       for (let i = 0; i < addedCustomAnimations.length; ++i) $("#whichAnim").children(`option[value=${addedCustomAnimations[i]}]`).remove();
   }

   function addCustomAnimationPreviews() {
       clearCustomAnimationPreviews();
       for (let i = 0; i < addedCustomAnimations.length; ++i) $("#whichAnim").append(new Option(`${addedCustomAnimations[i]}`, `${addedCustomAnimations[i]}`));
   }

   async function drawItemSheet(destCanvas, itemToDraw, addedCustomAnimations) {
       const destCtx = destCanvas.getContext("2d");
       const custom_animation = itemToDraw.custom_animation;
       if (custom_animation !== undefined) await drawCustomAnimationItem(destCtx, itemToDraw, addedCustomAnimations);
       else {
           for (const [key, value] of Object.entries(base_animations)) {
               const hasImage = await drawItemOnStandardAnimation(destCtx, value, key, itemToDraw);
               if (!hasImage) continue;
               let offSetY = universalSheetHeight;
               for (const custAnimName of addedCustomAnimations) {
                   const custAnim = customAnimations[custAnimName];
                   if (key === customAnimationBase(custAnim)) drawFramesToCustomAnimation(destCtx, custAnim, offSetY, destCanvas, animationRowsLayout);
                   offSetY += customAnimationSize(custAnim).height;
               }
           }
       }
   }

   async function drawCustomAnimationItem(destCtx, itemToDraw, addedCustomAnimations) {
       const custom_animation = itemToDraw.custom_animation;
       const filePath = itemToDraw.fileName;
       const img = await loadImage(filePath);
       if (img) {
           const y = customAnimationY(custom_animation, addedCustomAnimations);
           safeDrawImage(destCtx, img, 0, y, img.width, img.height, 0, 0, img.width, img.height);
       }
   }

   async function drawItemOnStandardAnimation(destCtx, destY, animName, itemToDraw) {
       const img = await getItemAnimationImage(itemToDraw, animName);
       if (img) {
           safeDrawImage(destCtx, img, 0, destY, img.width, img.height, 0, 0, img.width, img.height);
           return true;
       }
       return false;
   }

   async function getItemAnimationImage(itemToDraw, animName) {
       let animationToCheck = animName;
       if (animName === "combat_idle") animationToCheck = "combat";
       else if (animName === "backslash") animationToCheck = "1h_slash";
       else if (animName === "halfslash") animationToCheck = "1h_halfslash";
       const supportedAnimations = itemToDraw.supportedAnimations;
       if (supportedAnimations.includes(animationToCheck)) {
           const filePath = itemToDraw.fileName;
           const splitPath = splitFilePath(filePath);
           const newFile = `${splitPath.directory}/${animName}/${splitPath.file}`;
           return await loadImage(newFile);
       } else { if (DEBUG) console.log(`supportedAnimations does not contain ${animationToCheck} for asset ${itemToDraw.fileName}. skipping render`); }
       return null;
   }

   function drawFramesToCustomAnimation(customAnimationContext, customAnimationDefinition, offSetY, src, srcRowsLayout) {
       const frameSize = customAnimationDefinition.frameSize;
       for (let i = 0; i < customAnimationDefinition.frames.length; ++i) {
           const frames = customAnimationDefinition.frames[i];
           for (let j = 0; j < frames.length; ++j) {
               const srcColumn = parseInt(frames[j].split(",")[1]);
               const srcRowName = frames[j].split(",")[0];
               const srcRow = srcRowsLayout ? (srcRowsLayout[srcRowName] + 1) : i;
               drawFrameToFrame(customAnimationContext, { x: frameSize * j, y: frameSize * i + offSetY }, frameSize, src, { x: universalFrameSize * srcColumn, y: universalFrameSize * srcRow }, universalFrameSize);
           }
       }
   }

   function drawFrameToFrame(destCtx, destPos, destSize, src, srcPos, srcSize) {
       safeDrawImage(destCtx, src, destPos.x, destPos.y, destSize, destSize, srcPos.x, srcPos.y, srcSize, srcSize);
   }

   function selectDefaults() {
       $(`#${"body-Body_color_light"}`).prop("checked", true);
       $(`#${"head-Human_male_light"}`).prop("checked", true);
       setParams();
   }

   // =========================================================================
   // EVENT HANDLERS
   // =========================================================================

   $("#chooser input[type=radio]").each(function () {
       $(this).click(async function () {
           if (matchBodyColor) {
               const matchBodyColorForThisAsset = $(this).attr("matchBodyColor");
               if (matchBodyColorForThisAsset && matchBodyColorForThisAsset != "false") await selectColorsToMatch($(this).attr("variant"));
           }
           setParams();
           await redraw();
           showOrHideElements();
       });
   });

   async function selectColorsToMatch(variant) {
       const colorToMatch = variant;
       $("input[matchBodyColor^=true]:checked").each(function () {
           const assetType = $(this).attr("parentName").replaceAll(" ", "_");
           const assetToSelect = $(this).attr("name") + "-" + assetType + "_" + colorToMatch;
           $(`#${assetToSelect}`).prop("checked", true);
       });
       setParams();
       await redraw();
   }

   // =========================================================================
   // INITIALIZATION
   // =========================================================================

   async function initializeApplication() {
       interpretParams();
       if (Object.keys(params).length == 0) {
           $("input[type=reset]").click();
           setParams();
           selectDefaults();
       }
       await redraw();
       showOrHideElements();
       nextFrame();
       populateCategoryCheckboxes();
   }

   initializeApplication();
});