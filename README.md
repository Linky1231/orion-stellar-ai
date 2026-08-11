# Orión Estellar AI

Desarrolla a Orión Estellar con una estética profesional, elegante y minimalista inspirada en el estilo de Apple. Implementa animaciones intuitivas, transiciones fluidas y efectos de sonido sofisticados al presionar botones. Todos los botones deben ser completamente responsivos y adaptarse correctamente a dispositivos móviles y escritorio.

La IA debe responder los mensajes de forma inmediata y utilizar GPT-5 como modelo principal.

Si en el chat se escribe “Admin7880”, debe abrirse un panel de administración oculto con una base de datos inicialmente vacía para añadir información exclusiva de Orión. Solo el administrador podrá acceder a este panel. Los cambios realizados deben reflejarse para todos los usuarios automáticamente. El sistema debe permitir modificar comportamiento, personalidad, contexto y otros parámetros de Orión.

La base de datos debe estar basada en texto y permitir almacenar grandes cantidades de información, incluyendo párrafos extensos y múltiples entradas.

Haz que Orión pueda generar imágenes exactamente según las instrucciones del usuario. Además, debe ser capaz de analizar imágenes y leer archivos adjuntos enviados en el chat.

Nota: elimina temporalmente el apartado de ajustes, ya que no será necesario por ahora, y coloca la imagen del logo que envié anteriormente.

Añade un “Modo Notas” para guardar notas personales, ideas importantes y apuntes relacionados con el usuario.

En el modo administrador, debe ser posible subir imágenes que Orión pueda utilizar como referencia en sus respuestas y análisis.

Además, Orión debe poder leer y analizar documentos, imágenes y archivos enviados en el chat, incluyendo soporte completo para subir archivos directamente desde la interfaz.



Implementa un sistema de historial de chats persistente que permita guardar automáticamente todas las conversaciones del usuario.

El usuario debe poder:

- Ver la lista completa de chats anteriores.

- Volver a cualquier conversación en cualquier momento.

- Continuar exactamente donde la dejó, manteniendo el contexto y memoria del chat.

- Renombrar conversaciones.

- Eliminar chats manualmente.

- Buscar conversaciones por palabras clave.

- Mostrar fecha y hora de cada conversación.

- Guardar automáticamente mensajes en tiempo real.

El sistema debe tener una interfaz elegante y moderna, similar a aplicaciones premium de inteligencia artificial, con transiciones suaves entre conversaciones.

Cada chat debe almacenar:

- Mensajes del usuario.

- Respuestas de Orión.

- Imágenes enviadas.

- Archivos adjuntos.

- Notas relacionadas.

- Contexto y memoria de la conversación.

Añade sincronización eficiente para evitar pérdida de mensajes y optimiza la carga de historiales largos.

La experiencia debe sentirse rápida, fluida y profesional tanto en móviles como en escritorio.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://orion-stellar-ai.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/58f0d4aa-2adf-4759-a426-8ad8582d9d75).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
