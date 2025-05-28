import documentsService from "../services/documents.service.js";
import { formatResponse } from "../utils/helpers.js";

export const uploadDocument = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "No se proporcionó ningún archivo",
    });
  }

  const { expedienteId } = req.params;
  const document = await documentsService.uploadDocument(
    req.file,
    expedienteId,
    req.user.id
  );

  res
    .status(201)
    .json(formatResponse(document, "Documento subido exitosamente"));
};

export const deleteDocument = async (req, res) => {
  await documentsService.deleteDocument(req.params.id, req.user.id);
  res.json(formatResponse(null, "Documento eliminado exitosamente"));
};

export const getDocumentsByExpediente = async (req, res) => {
  const documents = await documentsService.getDocumentsByExpediente(
    req.params.expedienteId,
    req.user.id
  );
  res.json(formatResponse(documents, "Documentos obtenidos"));
};

export const getDocumentInfo = async (req, res) => {
  const document = await documentsService.getDocumentInfo(req.params.id);
  res.json(formatResponse(document, "Información del documento obtenida"));
};

export const getSecureDownloadUrl = async (req, res) => {
  const result = await documentsService.generateSecureUrl(
    req.params.id,
    req.user.id
  );
  res.json(formatResponse(result, "URL de descarga generada"));
};

export const getStatistics = async (req, res) => {
  const stats = await documentsService.getStatistics(
    req.user.id,
    req.user.role,
    req.user.departmentId
  );
  res.json(formatResponse(stats, "Estadísticas obtenidas"));
};
