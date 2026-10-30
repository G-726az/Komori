// What changed in each version, newest first. The first entry is the version
// that is running (keep it in step with Cargo.toml and tauri.conf.json).

export interface Version {
  v: string;
  name: string;
  date: string;
  items: string[];
}

export const CHANGELOG: Version[] = [
  { v: "0.2.0", name: "Estante", date: "Octubre 2026", items: [
    "Nuevo ícono: Bou, con su brote, sentado en la isla",
    "Nuevo estilo «Minimalista» (Ajustes → Apariencia): una isla negra y delgada, un solo tamaño para todo, con páginas compactas para Música, Claude Code, Calendario, Hoy, Sistema, Estante y Herramientas",
    "Nueva barra de pestañas abajo, con el nombre de la pestaña abierta y el botón de Ajustes, en los dos estilos; la isla cerrada es delgada también en el estilo completo",
    "Letras de las canciones sincronizadas línea por línea (LRCLIB, gratis y sin cuenta), y la línea que suena en la isla cerrada",
    "Música a todo color en los dos estilos: la isla se tiñe con el color de la app que suena (verde Spotify, rojo YouTube, naranja Brave…, o el de la portada si es otra), se ve su nombre, la letra al lado, y el volumen de Windows con el mismo estilo de línea que la canción",
    "Pestaña Claude Code: el proyecto, el tiempo que lleva y los pasos (Leer, Editar, Probar, Listo); en la isla completa, el cambio que hace como en un editor — líneas quitadas en rojo, añadidas en verde, con sus números — y el comando que corre",
    "Estante de archivos: arrastra archivos a la isla y elige qué hacer — guardarlos en el estante, abrirlos, mostrarlos en su carpeta, copiar la ruta o copiarlos al Escritorio o a Descargas",
    "Saludo al iniciar: la isla se abre un momento y la mascota te da los buenos días, tardes o noches (se apaga en Animaciones y 3D)",
    "Calendario compacto: la semana en una tira, el clima del día elegido y su agenda, con un formulario rápido para agregar",
    "Uso de cada núcleo del procesador en la página Sistema del estilo minimalista",
    "Tamaño de la isla: Automático (según tu pantalla), 100 % o 125 % (Ajustes → Apariencia)",
    "La línea de la canción se mueve con lo que suena — late, tiembla o salta con cada golpe, también con videos y juegos — y el ecualizador de la isla cerrada sigue el volumen real",
    "Ajustes más ordenados: secciones nuevas para Música y Claude Code, el tamaño y la forma de la isla en Apariencia, y el descanso de la mascota en Mascota",
    "Notas y Chat se pueden agrandar con las flechas de su cabecera",
    "Barras de desplazamiento finas y discretas en toda la isla",
    "Arreglos: el aviso de Claude ya no sale cortado en el estilo minimalista, la isla se cierra al abrir Ajustes y soltar archivos funciona desde el escritorio y el Explorador",
  ] },
  { v: "0.1.0", name: "Vinilo", date: "Octubre 2026", items: [
    "La carátula de la música puede ir sola, con su vinilo que sale al sonar, o como un vinilo girando con la portada al centro",
    "Seis estilos para la línea de tiempo de la canción: Clásica, Latido, Glitch, Regla, Guiones y Flecha",
    "Nueva sección «Animaciones y 3D»: mascota 3D o 2D, fluidez en reposo, órbita del clima, vinilo, ecualizador y detalles animados, con el atajo «Ahorro de energía»",
    "Mucho menos trabajo para la laptop: solo se dibuja lo que se ve y la mascota baja sus cuadros cuando solo respira (de ~53 % a ~17 % de un núcleo con la isla cerrada)",
    "Nuevo ajuste «Uso de la tarjeta gráfica»: Automático detecta tu gráfica y elige Calidad máxima, Equilibrado o Ahorro; en gráficas integradas la sombra 3D es pintada y las animaciones avanzan a pasos cortos",
    "La isla abierta usa bastante menos la tarjeta gráfica: la mascota grande de Inicio y la órbita del clima ya no redibujan filtros en cada cuadro, y nada pide cuadros mientras espera",
    "Guardarropa rehecho: cada mascota tiene su propio archivo y los accesorios se ajustan midiendo la forma real de su cabeza (gorros que abrazan, coronas que se apoyan, auriculares parejos)",
    "Bracitos y patitas para Bou, Fantasmita, Gato y Pelu; las alas del Pollito también acompañan los gestos",
    "Sonidos de la mascota (toque, alegría, puchero, mareo, café y despertar) con volumen en Ajustes → Mascota",
    "Bufanda de lana plana con nudo y flecos, pañuelo de tela con lunares, sombrero de bruja curvado, capucha gruesa, gafas con patillas y mascarilla con pliegues",
    "Borde de color para la isla, con grosor y vista previa (Ajustes → Apariencia)",
    "Opción para que la mascota siga o no al mouse",
    "Usar en Komori el token o la clave que ya guardaste en Coucou, sin tener que copiarla",
    "Aviso de versiones nuevas desde GitHub, con descarga e instalación desde Ajustes",
    "Historial de versiones en Acerca de",
  ] },
  { v: "0.0.9", name: "Blender", date: "Octubre 2026", items: [
    "Mascotas como modelos 3D de verdad, con volumen, luz y sombras suaves",
    "La neko rehecha con falda plisada, moño y peinados nuevos",
    "Reloj con el pronóstico en una órbita 3D que sigue al mouse",
    "La isla cerrada se ajusta al ancho de lo que muestra",
  ] },
  { v: "0.0.8", name: "Mesa", date: "Octubre 2026", items: [
    "Editor de Inicio: agrega, mueve y cambia el tamaño de las tarjetas, con arrastre gelatinoso",
    "Cualquier pieza de las pestañas se puede poner en Inicio, en el lugar que quieras",
    "Tarjeta de mascota grande que mira al mouse",
  ] },
  { v: "0.0.7", name: "Órbita", date: "Octubre 2026", items: [
    "Calendario y clima rediseñados: mes, reloj con pronóstico, anillos del día y agenda",
    "Forma «pegada arriba» con dos curvas que unen la isla a la pantalla",
    "Herramientas: cronómetro con vueltas, temporizador y pizarra de dibujo",
    "Recordatorios de eventos a su hora",
  ] },
  { v: "0.0.6", name: "Charla", date: "Octubre 2026", items: [
    "Chat con IA: Claude, servicios compatibles con OpenAI u Ollama en tu PC",
    "Pestaña de GitHub: notificaciones, revisiones pendientes y tus pull requests",
    "Avisos de Claude Code en la isla: cuando termina una tarea o te pregunta algo",
    "Las claves se guardan en el Administrador de credenciales de Windows",
  ] },
  { v: "0.0.5", name: "Atajos", date: "Octubre 2026", items: [
    "Apps: tus accesos rápidos con sus íconos",
    "Notas rápidas guardadas como .txt",
  ] },
  { v: "0.0.4", name: "Ritmo", date: "Octubre 2026", items: [
    "Control de lo que suena en cualquier reproductor de Windows",
    "Ecualizador y canción en la isla cerrada",
    "Medidores de procesador, memoria, disco, red y batería",
  ] },
  { v: "0.0.3", name: "Cielo", date: "Octubre 2026", items: [
    "Calendario con eventos y clima de tu ciudad",
    "Temperatura en la isla cerrada",
  ] },
  { v: "0.0.2", name: "Mascotas", date: "Octubre 2026", items: [
    "Bou, Fantasmita, Gato, Murciélago, Neko, Pollito y Pelu",
    "Estados de ánimo: alegría, curiosidad, puchero, mareo, café y descanso",
    "Guardarropa con accesorios para cada mascota",
  ] },
  { v: "0.0.1", name: "Brote", date: "Octubre 2026", items: [
    "Primera isla: se abre al acercar el mouse, temas, colores de acento y arranque con Windows",
  ] },
];

export const VERSION = CHANGELOG[0].v;
