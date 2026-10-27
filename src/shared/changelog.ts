// What changed in each version, newest first. The first entry is the version
// that is running (keep it in step with Cargo.toml and tauri.conf.json).

export interface Version {
  v: string;
  name: string;
  date: string;
  items: string[];
}

export const CHANGELOG: Version[] = [
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
