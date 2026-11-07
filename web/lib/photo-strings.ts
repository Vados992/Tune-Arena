import { languages, type Locale } from "./locale";
const text={
  camera:"Take a photo|Tirar fotografia|Hacer foto|Снять фото|Зробити фото|Prendre une photo",
  gallery:"Choose from gallery|Escolher da galeria|Elegir de la galería|Выбрать из галереи|Обрати з галереї|Choisir dans la galerie",
  native:"Open phone camera|Abrir câmara do telemóvel|Abrir cámara del móvil|Открыть камеру телефона|Відкрити камеру телефона|Ouvrir l’appareil photo du téléphone",
  shot:"Capture photo|Capturar fotografia|Capturar foto|Сделать снимок|Зробити знімок|Prendre la photo",
  cancel:"Close camera|Fechar câmara|Cerrar cámara|Закрыть камеру|Закрити камеру|Fermer la caméra",
  remove:"Remove photo|Remover fotografia|Quitar foto|Убрать фото|Прибрати фото|Retirer la photo",
  preview:"Photo preview|Pré-visualização|Vista previa|Предпросмотр фотографии|Попередній перегляд фото|Aperçu de la photo",
  note:"Camera and gallery photos are prepared on this device. Publish only when you are ready.|As fotos são preparadas neste dispositivo. Publica quando estiveres pronto.|Las fotos se preparan en este dispositivo. Publica cuando estés listo.|Фото с камеры и из галереи подготавливаются на устройстве. Публикуй, когда всё готово.|Фото з камери та галереї готуються на пристрої. Публікуй, коли все готово.|Les photos sont préparées sur cet appareil. Publie quand tu es prêt.",
  error:"Allow camera access in your browser, or use the phone camera or gallery below.|Permite o acesso à câmara ou usa a câmara do telemóvel ou a galeria abaixo.|Permite el acceso a la cámara o usa la cámara del móvil o la galería de abajo.|Разреши доступ к камере в браузере или используй камеру телефона либо галерею ниже.|Дозволь доступ до камери в браузері або скористайся камерою телефона чи галереєю нижче.|Autorise la caméra dans le navigateur ou utilise l’appareil photo ou la galerie ci-dessous.",
  preparing:"Preparing photo…|A preparar fotografia…|Preparando foto…|Подготавливаем фото…|Готуємо фото…|Préparation de la photo…",
  starting:"Starting camera…|A iniciar a câmara…|Abriendo cámara…|Открываем камеру…|Відкриваємо камеру…|Ouverture de la caméra…",
} as const;
export function photoText(locale:Locale) {
  return Object.fromEntries(Object.entries(text).map(([key,value])=>[key,value.split("|")[languages.indexOf(locale)]])) as Record<keyof typeof text,string>;
}
