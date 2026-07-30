// Script de suporte para futura interação
document.addEventListener('DOMContentLoaded', () => {
    console.log('Tuba Brasil interface carregada');

    /* =====================================================
       CONFIGURAÇÃO DE SEGURANÇA - WHATSAPP
       ===================================================== */
    const NUMERO_ZAP_OFUSCADO = 'NTU2MjgyODAxMzc1'; 
    const DOMINIO_OFICIAL = 'juliocesarviana20.github.io';

    function obterNumeroWhatsApp() {
        const host = window.location.hostname;
        const permitido = host === DOMINIO_OFICIAL || host === 'localhost' || host === '127.0.0.1';
        
        if (!permitido) {
            console.warn('Site não autorizado. Pedido bloqueado.');
            alert('Erro de segurança. Entre em contato pelo Instagram oficial.');
            return null;
        }
        
        return atob(NUMERO_ZAP_OFUSCADO);
    }
    /* ===================================================== */

    const CARRINHO_KEY = 'tubabrasil_carrinho';

    function loadCarrinho() {
        try {
            const raw = localStorage.getItem(CARRINHO_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function saveCarrinho(itens) {
        localStorage.setItem(CARRINHO_KEY, JSON.stringify(itens));
    }

    function formatPreco(valor) {
        return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    const produtos = [
      {
        nome: "Camiseta Branca",
        preco: 59.90,
        tamanhos: ['P','M','G','GG'],
        descricao: "Camiseta branca confeccionada em algodão de alta qualidade, proporcionando conforto, leveza e durabilidade. Ideal para compor looks casuais no dia a dia."
      },
      {
        nome: "Camiseta Preta",
        preco: 59.90,
        tamanhos: ['P','M','G','GG'],
        descricao: "Camiseta preta confeccionada em algodão de alta qualidade, proporcionando conforto, leveza e durabilidade. Ideal para compor looks casuais no dia a dia."
      }
    ];

    const container = document.querySelector(".cards-grid");

    if (container) {
        produtos.forEach(p => {
            const imgNome = p.nome.includes('Preta') ? 'camisaPreta.png' : 'camisaBrancaF.png';
            const nomeJs = JSON.stringify(p.nome);
            const optionsTamanhos = p.tamanhos.map(t => `<option value="${t}">${t}</option>`).join('');
            
            container.innerHTML += `
                <article class="card">
                    <h4>${p.nome}</h4>
                    <img src="img/${imgNome}" class="card-image" alt="${p.nome}">

                    <p>Preço: ${formatPreco(p.preco)}</p>
                    
                    <label>Tamanho:
                        <select class="select-tamanho" data-nome=${nomeJs}>
                            ${optionsTamanhos}
                        </select>
                    </label>

                    <details>
                        <summary>Descrição</summary>
                        ${p.descricao}
                    </details>
                    <button type="button" class="button third" data-add-cart data-nome=${nomeJs} data-preco="${p.preco}">
                        Adicionar ao carrinho
                    </button>
                </article>
            `;
        });

        container.querySelectorAll('[data-add-cart]').forEach(btn => {
            btn.addEventListener('click', () => {
                const nome = btn.getAttribute('data-nome');
                const preco = parseFloat(btn.getAttribute('data-preco'));
                const selectTamanho = btn.closest('.card').querySelector('.select-tamanho');
                const tamanho = selectTamanho.value;
                
                if (nome && !Number.isNaN(preco)) {
                    adicionarCarrinho(nome, preco, tamanho);
                    alert(`${nome} - Tam ${tamanho} adicionado!`);
                }
            });
        });
    }

    // carrinho — navegação
    const cartIcon = document.querySelector('.cart-icon');
    if (cartIcon) {
        cartIcon.addEventListener('click', () => {
           window.location.href = 'cart.html';
        });
    }

    function bindReturnButtons() {
        document.querySelectorAll('.return-icon, .return-icon-inline').forEach(el => {
            el.addEventListener('click', () => {
                window.location.href = 'index.html';
            });
        });
    }
    bindReturnButtons();

    function adicionarCarrinho(nome, preco, tamanho) {
        const itens = loadCarrinho();
        const existente = itens.find(i => i.nome === nome && i.tamanho === tamanho);
        if (existente) {
            existente.quantidade = (existente.quantidade || 1) + 1;
        } else {
            itens.push({ nome, preco, tamanho, quantidade: 1 });
        }
        saveCarrinho(itens);
        console.log('Carrinho:', itens);
    }

    window.adicionarCarrinho = adicionarCarrinho;

    function renderCartPage() {
        const listEl = document.getElementById('cart-list');
        const emptyEl = document.getElementById('cart-empty');
        const filledEl = document.getElementById('cart-filled');
        const subtotalEl = document.getElementById('cart-subtotal');
        const totalEl = document.getElementById('cart-total');
        if (!listEl || !emptyEl || !filledEl) return;

        const itens = loadCarrinho();
        const temItens = itens.length > 0;

        emptyEl.hidden = temItens;
        filledEl.hidden = !temItens;

        if (!temItens) {
            listEl.innerHTML = '';
            return;
        }

        let subtotal = 0;
        listEl.innerHTML = itens.map((item, index) => {
            const q = item.quantidade || 1;
            const linha = item.preco * q;
            subtotal += linha;
            const nomeEsc = item.nome.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
            return `
                <li class="cart-item" data-index="${index}">
                    <div class="cart-item-info">
                        <span class="cart-item-name">${nomeEsc}</span>
                        <span class="cart-item-tamanho">Tam: ${item.tamanho || 'Único'}</span>
                        <span class="cart-item-unit">${formatPreco(item.preco)} <span class="cart-item-each">cada</span></span>
                    </div>
                    <div class="cart-item-actions">
                        <div class="cart-qty" role="group" aria-label="Quantidade de ${nomeEsc}">
                            <button type="button" class="cart-qty-btn" data-action="dec" data-index="${index}" aria-label="Diminuir">−</button>
                            <span class="cart-qty-value">${q}</span>
                            <button type="button" class="cart-qty-btn" data-action="inc" data-index="${index}" aria-label="Aumentar">+</button>
                        </div>
                        <span class="cart-item-line">${formatPreco(linha)}</span>
                        <button type="button" class="cart-remove" data-action="remove" data-index="${index}" aria-label="Remover item">Remover</button>
                    </div>
                </li>
            `;
        }).join('');

        if (subtotalEl) subtotalEl.textContent = formatPreco(subtotal);
        if (totalEl) totalEl.textContent = formatPreco(subtotal);

        listEl.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                const action = btn.getAttribute('data-action');
                let novo = loadCarrinho();
                if (Number.isNaN(idx) || idx < 0 || idx >= novo.length) return;

                if (action === 'remove') {
                    novo.splice(idx, 1);
                } else if (action === 'inc') {
                    novo[idx].quantidade = (novo[idx].quantidade || 1) + 1;
                } else if (action === 'dec') {
                    const q = (novo[idx].quantidade || 1) - 1;
                    if (q <= 0) novo.splice(idx, 1);
                    else novo[idx].quantidade = q;
                }
                saveCarrinho(novo);
                renderCartPage();
            });
        });
    }

    const btnLimpar = document.getElementById('btn-limpar');
    if (btnLimpar) {
        btnLimpar.addEventListener('click', () => {
            saveCarrinho([]);
            renderCartPage();
        });
    }

    const pixResultEl = document.getElementById('pix-payment-result');

    async function gerarPagamentoPix() {
        const itens = loadCarrinho();
        if (itens.length === 0) {
            alert('Seu carrinho está vazio. Adicione produtos antes de gerar o pagamento.');
            return;
        }

        const btnPix = document.getElementById('btn-pix');
        if (btnPix) {
            btnPix.disabled = true;
            btnPix.textContent = 'Gerando Pix...';
        }

        try {
            const response = await fetch('/api/create-pix-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itens }),
            });

            const data = await response.json();
            if (!response.ok || !data.qrCode) {
                throw new Error(data.error || 'Não foi possível gerar o pagamento por Pix.');
            }

            if (pixResultEl) {
                pixResultEl.hidden = false;
                pixResultEl.innerHTML = `
                    <h3>Pague com Pix</h3>
                    <p>Escaneie o QR Code abaixo ou use o código abaixo para pagar.</p>
                    <div class="pix-qr-box">
                        <img src="data:image/png;base64,${data.qrCodeBase64}" alt="QR Code do Pix" />
                    </div>
                    <p><strong>Código Pix:</strong></p>
                    <textarea readonly>${data.qrCode}</textarea>
                    <p><small>Valor: ${formatPreco(data.transactionAmount || 0)}</small></p>
                `;
            }

            alert('Pix criado! Escaneie o QR Code para concluir o pagamento.');
        } catch (error) {
            console.error(error);
            alert(`Não foi possível gerar o Pix. ${error.message}`);
        } finally {
            if (btnPix) {
                btnPix.disabled = false;
                btnPix.textContent = 'Pagar com Pix';
            }
        }
    }

    const btnPix = document.getElementById('btn-pix');
    if (btnPix) {
        btnPix.addEventListener('click', gerarPagamentoPix);
    }

    // === CHECKOUT DE PAGAMENTO ===
    const btnFinalizar = document.getElementById('btn-finalizar');
    if (btnFinalizar) {
        btnFinalizar.addEventListener('click', async () => {
            const itens = loadCarrinho();
            if (itens.length === 0) {
                alert('Teu carrinho tá vazio!');
                return;
            }

            btnFinalizar.disabled = true;
            btnFinalizar.textContent = 'Criando pagamento...';

            try {
                const response = await fetch('/api/create-preference', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itens }),
                });

                const data = await response.json();
                if (!response.ok || !data.init_point) {
                    throw new Error(data.error || 'Não foi possível iniciar o pagamento.');
                }

                window.location.href = data.init_point;
            } catch (error) {
                console.error(error);
                alert(`Não foi possível abrir o checkout. ${error.message}`);
            } finally {
                btnFinalizar.disabled = false;
                btnFinalizar.textContent = 'Finalizar pedido';
            }
        });
    }

    if (document.body.classList.contains('cart-page')) {
        renderCartPage();
    }



}); // Fim do DOMContentLoaded