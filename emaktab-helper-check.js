// Файл: emaktab-solver.js (ПОЛНАЯ ВЕРСИЯ с улучшенной обработкой формул)

(async function() {
    'use strict';

    console.log('eMaktab Solver Script: Запущен.');

    // --- НАСТРОЙКИ ---
    const GEMINI_API_KEY = 'AIzaSyB9vWInkcJrlGJmhRteOSthybGnSDUwfGw'; // !!! ОБЯЗАТЕЛЬНО ЗАМЕНИ НА СВОЙ КЛЮЧ !!!
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent?key=${GEMINI_API_KEY}`;

    // --- Глобальные переменные для UI ---
    let chatWindow = null;
    let textInput = null;
    let chatOutput = null;
    let sendButton = null;
    let helperButton = null; // Для кнопки вызова чата
    let currentImageBase64 = null;
    let currentImageMimeType = null;
    let uiVisible = true; // Флаг видимости UI

    // --- Функции для UI ---

    function createChatUI() {
        if (document.getElementById('emaktab-ai-chat-window')) return;

        chatWindow = document.createElement('div');
        chatWindow.id = 'emaktab-ai-chat-window';
        Object.assign(chatWindow.style, {
            position: 'fixed', bottom: '60px', right: '20px', 
            width: '380px', // Увеличена ширина
            maxHeight: '550px', // Увеличена максимальная высота
            backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '8px', 
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: '100000', display: 'flex', flexDirection: 'column', 
            padding: '10px', boxSizing: 'border-box'
        });

        const headerDiv = document.createElement('div');
        Object.assign(headerDiv.style, {
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
            marginBottom: '8px', paddingBottom: '5px', borderBottom: '1px solid #eee'
        });

        const titleSpan = document.createElement('span');
        titleSpan.textContent = 'AI Помощник (чат)';
        titleSpan.style.fontWeight = 'bold';
        titleSpan.style.fontSize = '14px';
        headerDiv.appendChild(titleSpan);

        const closeButton = document.createElement('button');
        closeButton.textContent = '✖';
        Object.assign(closeButton.style, {
            border: 'none', background: 'transparent', cursor: 'pointer', 
            fontSize: '18px', padding: '0', lineHeight: '1'
        });
        closeButton.onclick = () => chatWindow.style.display = 'none';
        headerDiv.appendChild(closeButton);
        chatWindow.appendChild(headerDiv);

        chatOutput = document.createElement('div');
        Object.assign(chatOutput.style, {
            flexGrow: '1', overflowY: 'auto', marginBottom: '10px', 
            border: '1px solid #eee', padding: '8px', fontSize: '13px',
            minHeight: '200px', backgroundColor: '#f9f9f9', borderRadius: '4px'
        });
        chatWindow.appendChild(chatOutput);

        textInput = document.createElement('textarea');
        textInput.placeholder = 'Ваш вопрос или Ctrl+V для скриншота';
        textInput.rows = 4; // Немного больше строк
        Object.assign(textInput.style, {
            width: '100%', marginBottom: '10px', padding: '8px', 
            border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical', 
            boxSizing: 'border-box', fontSize: '13px', minHeight: '60px'
        });
        textInput.addEventListener('paste', handlePaste);
        chatWindow.appendChild(textInput);

        sendButton = document.createElement('button');
        sendButton.textContent = 'Отправить Gemini';
        Object.assign(sendButton.style, {
            padding: '10px', backgroundColor: '#673ab7', color: 'white', 
            border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%',
            fontSize: '14px', fontWeight: 'bold'
        });
        sendButton.onclick = handleSendToGemini;
        chatWindow.appendChild(sendButton);

        document.body.appendChild(chatWindow);
        chatWindow.style.display = 'none';
    }

    function toggleChatWindow() {
        if (!chatWindow) createChatUI();
        const станетВидимым = chatWindow.style.display === 'none';
        if (станетВидимым && !uiVisible) { // Если UI скрыт глобально, не показываем чат
             addMessageToChat('<i>AI интерфейс скрыт. Нажмите "z" для отображения.</i>', 'system');
             // Можно показать временное сообщение другим способом, если чат скрыт
            return;
        }
        chatWindow.style.display = станетВидимым ? 'flex' : 'none';
        if (станетВидимым) {
            addMessageToChat('<i>Вставьте скриншот (Ctrl+V) или напишите вопрос.</i>', 'system');
            textInput.focus();
        }
    }
    
    function toggleMainUI() {
        uiVisible = !uiVisible;
        if (helperButton) helperButton.style.display = uiVisible ? 'block' : 'none';
        if (chatWindow) chatWindow.style.display = uiVisible ? (chatWindow.style.display === 'none' ? 'none' : 'flex') : 'none';
        
        if (!uiVisible) {
            console.log("AI Helper UI скрыт. Нажмите 'z' для отображения.");
        } else {
            console.log("AI Helper UI отображен.");
        }
    }

    function addMessageToChat(message, sender = 'user') {
        if (!chatOutput) return;
        const messageDiv = document.createElement('div');
        messageDiv.style.marginBottom = '8px';
        messageDiv.style.padding = '6px 10px';
        messageDiv.style.borderRadius = '6px';
        messageDiv.style.wordBreak = 'break-word';
        messageDiv.style.maxWidth = '90%';
        messageDiv.style.lineHeight = '1.4';

        if (sender === 'gemini') {
            messageDiv.style.backgroundColor = '#e1f5fe';
            messageDiv.style.alignSelf = 'flex-start';
            messageDiv.innerHTML = `<strong style="color:#0277bd;">Gemini:</strong> ${message.replace(/\n/g, '<br>')}`;
        } else if (sender === 'user') {
            messageDiv.style.backgroundColor = '#dcedc8';
            messageDiv.style.alignSelf = 'flex-end';
            messageDiv.innerHTML = `<strong style="color:#387002;">Вы:</strong> ${message}`;
        } else if (sender === 'user-image') {
             messageDiv.style.textAlign = 'center';
             messageDiv.style.padding = '0';
             messageDiv.style.marginBottom = '10px';
             messageDiv.innerHTML = message; // message уже будет <img ...>
        } else { // system
            messageDiv.style.fontStyle = 'italic';
            messageDiv.style.color = '#666';
            messageDiv.style.textAlign = 'center';
            messageDiv.style.fontSize = '11px';
            messageDiv.innerHTML = `${message}`;
        }
        chatOutput.appendChild(messageDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }

    function handlePaste(event) {
        const items = (event.clipboardData || event.originalEvent.clipboardData)?.items;
        if (!items) return;
        let foundImage = false;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    foundImage = true;
                    addMessageToChat('<i>Обработка изображения...</i>', 'system'); // Сообщение о загрузке
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const base64WithPrefix = e.target.result;
                        currentImageBase64 = base64WithPrefix.split(',')[1];
                        currentImageMimeType = base64WithPrefix.substring(base64WithPrefix.indexOf(':') + 1, base64WithPrefix.indexOf(';'));
                        
                        // Очищаем предыдущее изображение, если было
                        const existingImagePreview = chatOutput.querySelector('img[alt="вставленный скриншот"]');
                        if(existingImagePreview) existingImagePreview.parentElement.remove();

                        addMessageToChat('<img src="' + base64WithPrefix + '" style="max-width:100%; max-height:150px; border:1px solid #ddd; margin-top:5px;" alt="вставленный скриншот">', 'user-image');
                        addMessageToChat('<i>Скриншот прикреплен. Добавьте вопрос или нажмите "Отправить".</i>', 'system');
                        // НЕ очищаем textInput.value здесь, чтобы пользователь мог сначала написать текст, потом вставить картинку
                    };
                    reader.onerror = function() {
                        addMessageToChat('<i>Ошибка чтения файла изображения.</i>', 'system');
                    }
                    reader.readAsDataURL(blob);
                    event.preventDefault();
                    break; 
                }
            }
        }
        if (foundImage) console.log("Изображение вставлено из буфера обмена.");
    }

    async function handleSendToGemini() {
        const userText = textInput.value.trim();
        if (!currentImageBase64 && !userText) {
            addMessageToChat('<i>Ошибка: Вставьте скриншот или напишите текстовый вопрос.</i>', 'system');
            return;
        }
        if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
            alert('Пожалуйста, вставьте ваш API ключ Gemini в скрипт!');
            return;
        }
        
        let partsArray = [];
        let userMessageForChat = "";

        if (userText) {
            partsArray.push({ text: userText });
            userMessageForChat = userText;
        }
        // Если есть прикрепленное изображение, добавляем его
        if (currentImageBase64 && currentImageMimeType) {
            partsArray.push({
                inline_data: {
                    mime_type: currentImageMimeType,
                    data: currentImageBase64
                }
            });
             if (!userText) userMessageForChat = '(Отправлен только скриншот)';
             // Если был текст и картинка, картинка уже отображена, текст будет отображен ниже
        }
        
        if (userMessageForChat) { // Отображаем сообщение пользователя, если оно есть
            addMessageToChat(userMessageForChat, 'user');
        }


        sendButton.disabled = true;
        sendButton.textContent = '⏳ Отправка...';
        chatOutput.scrollTop = chatOutput.scrollHeight;

        const requestBody = {
            contents: [{ parts: partsArray }],
            // generationConfig: { temperature: 0.5, maxOutputTokens: 1024 } 
        };

        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Gemini API Error:', response.status, errorData);
                const detailedError = errorData?.error?.message || JSON.stringify(errorData);
                addMessageToChat(`ОШИБКА API ${response.status}: ${detailedError}`, 'gemini');
            } else {
                const data = await response.json();
                if (data.candidates && data.candidates[0]?.content?.parts?.[0]) {
                    const geminiResponseText = data.candidates[0].content.parts[0].text.trim();
                    addMessageToChat(geminiResponseText, 'gemini');
                } else if (data.promptFeedback && data.promptFeedback.blockReason) {
                    addMessageToChat(`ЗАПРОС ЗАБЛОКИРОВАН: ${data.promptFeedback.blockReason}`, 'gemini');
                } else {
                    addMessageToChat('Нет ответа от Gemini или некорректный формат.', 'gemini');
                }
            }
        } catch (error) {
            console.error('Ошибка при запросе к Gemini API:', error);
            addMessageToChat(`Сетевая ошибка: ${error.message}`, 'gemini');
        } finally {
            sendButton.disabled = false;
            sendButton.textContent = 'Отправить Gemini';
            // Очищаем прикрепленное изображение и текст ПОСЛЕ отправки
            currentImageBase64 = null;
            currentImageMimeType = null;
            textInput.value = ""; 
            // Очищаем превью изображения из чата (если оно было последним сообщением типа user-image)
            const lastMessage = chatOutput.lastElementChild;
            if (lastMessage && lastMessage.querySelector('img[alt="вставленный скриншот"]')) {
                 // Можно удалить, или оставить как часть истории. Пока оставим.
                 // lastMessage.remove(); 
            }
             addMessageToChat('<i>Готово. Вставьте следующий скриншот или вопрос.</i>', 'system');
        }
    }

    helperButton = document.createElement('button');
    helperButton.textContent = '💬 AI';
    Object.assign(helperButton.style, {
        position: 'fixed', bottom: '20px', right: '20px', zIndex: '99998',
        padding: '10px 15px', backgroundColor: '#007bff', color: 'white',
        border: 'none', borderRadius: '25px', cursor: 'pointer', fontSize: '16px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)', fontWeight: 'bold'
    });
    helperButton.id = 'emaktab-ai-helper-button';
    helperButton.onclick = toggleChatWindow;

    if (!document.getElementById('emaktab-ai-helper-button')) {
        document.body.appendChild(helperButton);
    }
    createChatUI();

    // Обработчик для скрытия/показа UI по клавише "z"
    document.addEventListener('keydown', function(event) {
        // Проверяем, что фокус не на поле ввода, чтобы не мешать печатать "z"
        if (event.key === 'z' && document.activeElement !== textInput && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            toggleMainUI();
        }
    });

})();
