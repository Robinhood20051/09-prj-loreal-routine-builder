/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const searchInput = document.getElementById("searchInput");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");

const CLOUDFLARE_WORKER_URL = "https://lorealworker.rzaw001.workers.dev";

/* Track selected products - load from localStorage on init */
let selectedProducts = loadSelectedProductsFromStorage();
let allProducts = [];

/* Initialize UI */
updatePlaceholder();

/* Load product data from JSON file */
async function loadProducts() {
  if (allProducts.length === 0) {
    const response = await fetch("products.json");
    const data = await response.json();
    allProducts = data.products;
  }
  return allProducts;
}

/* Filter products based on category and search term */
function filterProducts(products, category = "", searchTerm = "") {
  let filtered = products;

  if (category) {
    filtered = filtered.filter((product) => product.category === category);
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        product.brand.toLowerCase().includes(term) ||
        (product.description &&
          product.description.toLowerCase().includes(term))
    );
  }

  return filtered;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `<div class="placeholder-message">No products found matching your criteria.</div>`;
    return;
  }

  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card${isProductSelected(product) ? " selected" : ""}" 
         data-product-id="${product.id}" 
         onclick="toggleProductSelection('${product.id}')">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p class="product-brand">${product.brand}</p>
        <button class="info-modal-btn" onclick="event.stopPropagation(); openProductModal('${
          product.id
        }')" aria-label="View product details">
          <i class="fa-solid fa-info-circle"></i>
          <span>Details</span>
        </button>
      </div>
      <div class="selection-indicator ${
        isProductSelected(product) ? "visible" : ""
      }">
        <i class="fa-solid fa-check"></i>
      </div>
    </div>
  `
    )
    .join("");
}

/* Helper: check if product is selected */
function isProductSelected(product) {
  return selectedProducts.some((p) => p.id === product.id);
}

/* Toggle product selection */
async function toggleProductSelection(productId) {
  const products = await loadProducts();
  const product = products.find((p) => String(p.id) === String(productId));
  if (!product) return;

  const idx = selectedProducts.findIndex((p) => p.id === product.id);
  if (idx === -1) {
    selectedProducts.push(product);
  } else {
    selectedProducts.splice(idx, 1);
  }

  saveSelectedProductsToStorage();
  updateSelectedProductsDisplay();
  updateProductCardSelection(productId);
}

/* Update individual product card selection state */
function updateProductCardSelection(productId) {
  const productCard = document.querySelector(
    `[data-product-id="${productId}"]`
  );
  if (!productCard) return;

  const isSelected = selectedProducts.some(
    (p) => String(p.id) === String(productId)
  );

  productCard.classList.toggle("selected", isSelected);
  productCard
    .querySelector(".selection-indicator")
    .classList.toggle("visible", isSelected);
}

/* Display selected products in the UI */
function updateSelectedProductsDisplay() {
  if (!selectedProductsList) return;

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `<div class="placeholder-message">No products selected yet.</div>`;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
      <div class="selected-product-item" data-selected-id="${product.id}">
        <img src="${product.image}" alt="${product.name}">
        <div class="selected-product-info">
          <span class="product-name">${product.name}</span>
          <span class="product-brand">${product.brand}</span>
        </div>
        <div class="selected-actions">
          <button class="info-btn-small" onclick="openProductModal('${product.id}')" title="Details">
            <i class="fa-solid fa-info"></i>
          </button>
          <button class="remove-btn" onclick="removeFromSelected('${product.id}')" title="Remove">
            <i class="fa-solid fa-times"></i>
          </button>
        </div>
      </div>
    `
    )
    .join("");
}

/* Remove product from selected list */
function removeFromSelected(productId) {
  const idx = selectedProducts.findIndex(
    (p) => String(p.id) === String(productId)
  );
  if (idx !== -1) {
    selectedProducts.splice(idx, 1);
    saveSelectedProductsToStorage();
    updateSelectedProductsDisplay();
    updateProductCardSelection(productId);
    updateModalButton(productId);
  }
}

/* Search functionality */
if (searchInput) {
  searchInput.addEventListener("input", async (e) => {
    const products = await loadProducts();
    const filteredProducts = filterProducts(
      products,
      categoryFilter.value,
      e.target.value
    );
    displayProducts(filteredProducts);
  });
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const searchTerm = searchInput ? searchInput.value : "";
  localStorage.setItem("lorealSelectedCategory", e.target.value);
  const filteredProducts = filterProducts(products, e.target.value, searchTerm);
  displayProducts(filteredProducts);
});

/* API function to call Cloudflare Worker */
async function callCloudflareWorker(message, selectedProductsData = []) {
  try {
    const productsForAPI = selectedProductsData.map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description || "No description available",
    }));

    const userPrompt =
      selectedProductsData.length > 0
        ? `Create a detailed beauty routine using these L'Oréal products: ${productsForAPI
            .map(
              (p) => `${p.name} by ${p.brand} (${p.category}): ${p.description}`
            )
            .join("\n")}. User question: ${message}`
        : message;

    const response = await fetch(CLOUDFLARE_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "You are a L'Oréal beauty expert assistant. You specialize in creating personalized beauty routines using L'Oréal products. When provided with selected products, create detailed step-by-step routines that include proper order of application, timing recommendations, specific techniques, and tips for best results., if the prompt is unrelated, don't answer and ask politely for a question about Loreal products",
          },
          { role: "user", content: userPrompt },
        ],
        selectedProducts: productsForAPI,
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();

    return (
      data.choices?.[0]?.message?.content ||
      data.response ||
      data.message ||
      data.content ||
      (typeof data === "string"
        ? data
        : "Sorry, I couldn't generate a response. Please try again.")
    );
  } catch (error) {
    console.error("Error calling Cloudflare Worker:", error);
    return "Sorry, there was an error connecting to our service. Please try again later.";
  }
}

// Generate routine button event listener
document
  .getElementById("generateRoutine")
  .addEventListener("click", async function () {
    if (selectedProducts.length === 0) {
      addMessageToChat(
        "bot",
        "No products selected yet. Please select products from the grid above to create your personalized routine."
      );
      return;
    }

    const loadingMessage = `Generating your personalized routine with ${
      selectedProducts.length
    } selected product${selectedProducts.length > 1 ? "s" : ""}...`;
    addMessageToChat("bot", loadingMessage);

    try {
      const routine = await callCloudflareWorker(
        `Create a comprehensive step-by-step beauty routine using these ${
          selectedProducts.length
        } L'Oréal products: ${selectedProducts
          .map((p) => p.name)
          .join(
            ", "
          )}. Include application order, timing, and specific tips for optimal results.`,
        selectedProducts
      );

      removeLastMessage();
      addMessageToChat("bot", routine);

      setTimeout(() => {
        addMessageToChat(
          "bot",
          "Would you like me to modify this routine or explain any specific steps in more detail?"
        );
      }, 1000);
    } catch (error) {
      removeLastMessage();
      addMessageToChat(
        "bot",
        "Sorry, there was an error generating your routine. Please try again or ask me specific questions about your selected products."
      );
    }
  });

// Chat form submission
document
  .getElementById("chatForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const userInput = document.getElementById("userInput");
    const message = userInput.value.trim();
    if (!message) return;

    addMessageToChat("user", message);
    userInput.value = "";
    addMessageToChat("bot", "Typing...");

    try {
      const response = await callCloudflareWorker(message, selectedProducts);
      removeLastMessage();
      addMessageToChat("bot", response);
    } catch (error) {
      removeLastMessage();
      addMessageToChat(
        "bot",
        "Sorry, I'm having trouble responding right now. Please try again."
      );
    }
  });

// Utility functions
function addMessageToChat(sender, message) {
  const msgDiv = document.createElement("div");
  msgDiv.className =
    sender === "user" ? "chat-message user" : "chat-message bot";

  if (sender === "bot") {
    msgDiv.innerHTML = formatBotMessage(message);
  } else {
    msgDiv.textContent = message;
  }

  chatWindow.appendChild(msgDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function formatBotMessage(message) {
  let formatted = message
    .trim()
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n\n+/g, "<br><br>")
    .replace(/\n/g, "<br>")
    .replace(
      /(\d+)\.\s+/g,
      '<br><div class="step-number">$1.</div><div class="step-content">'
    )
    .replace(/•\s+/g, "<br>• ")
    .replace(/^\s*<br>/, "")
    .replace(
      /<div class="step-content">(.*?)(?=<br><div class="step-number">|$)/g,
      '<div class="step-content">$1</div>'
    );

  return `<div class="formatted-response">${formatted}</div>`;
}

function removeLastMessage() {
  if (chatWindow.lastChild) chatWindow.removeChild(chatWindow.lastChild);
}

function saveSelectedProductsToStorage() {
  try {
    localStorage.setItem(
      "lorealSelectedProducts",
      JSON.stringify(selectedProducts)
    );
  } catch (error) {
    console.error("Error saving selected products to localStorage:", error);
  }
}

function loadSelectedProductsFromStorage() {
  try {
    const stored = localStorage.getItem("lorealSelectedProducts");
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error loading selected products from localStorage:", error);
    return [];
  }
}

function updatePlaceholder() {
  productsContainer.innerHTML = `<div class="placeholder-message">Choose a Category</div>`;
}

// Modal functions
async function openProductModal(productId) {
  const products = await loadProducts();
  const product = products.find((p) => String(p.id) === String(productId));
  if (!product) return;

  const modal = document.getElementById("productModal") || createProductModal();

  modal.querySelector(".modal-content").innerHTML = `
    <div class="modal-header">
      <h2>${product.name}</h2>
      <button class="modal-close" onclick="closeProductModal()">&times;</button>
    </div>
    <div class="modal-body">
      <img src="${product.image}" alt="${product.name}" class="modal-image">
      <div class="modal-details">
        <p class="modal-brand"><strong>Brand:</strong> ${product.brand}</p>
        <p class="modal-category"><strong>Category:</strong> ${
          product.category
        }</p>
        <div class="modal-description">
          <strong>Description:</strong>
          <p>${
            product.description || "No description available for this product."
          }</p>
        </div>
      </div>
    </div>
  `;

  modal.style.display = "block";
  document.body.style.overflow = "hidden";
}

function createProductModal() {
  const modal = document.createElement("div");
  modal.id = "productModal";
  modal.className = "modal";
  modal.innerHTML = '<div class="modal-content"></div>';

  document.body.appendChild(modal);

  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeProductModal();
  });

  return modal;
}

function closeProductModal() {
  const modal = document.getElementById("productModal");
  if (modal) {
    modal.style.display = "none";
    document.body.style.overflow = "auto";
  }
}

// Set RTL/LTR direction based on browser language on load
window.addEventListener("load", function () {
  // Detect browser language for RTL support
  const rtlLangs = ["ar", "he", "fa", "ur"];
  const browserLang = (navigator.language || navigator.userLanguage || "en")
    .split("-")[0]
    .toLowerCase();
  const isRTL = rtlLangs.includes(browserLang);
  document.documentElement.dir = isRTL ? "rtl" : "ltr";
  document.documentElement.lang = browserLang;

  updateSelectedProductsDisplay();

  const storedCategory = localStorage.getItem("lorealSelectedCategory");
  if (storedCategory && categoryFilter) {
    categoryFilter.value = storedCategory;
    categoryFilter.dispatchEvent(new Event("change"));
  }
});
