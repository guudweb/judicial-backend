import resend from "../config/resend.js";
import logger from "../utils/logger.js";
import { db, users } from "../db/index.js";
import { eq } from "drizzle-orm";

class EmailService {
  constructor() {
    this.fromEmail =
      process.env.RESEND_FROM_EMAIL || "notificaciones@poderjudicial.gq";
    this.fromName = process.env.RESEND_FROM_NAME || "Sistema Judicial";
  }

  async sendEmail({ to, subject, html, text, replyTo }) {
    try {
      const result = await resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text: text || this.htmlToText(html),
        reply_to: replyTo,
      });

      logger.info("Email enviado exitosamente", {
        emailId: result.id,
        to,
        subject,
      });

      return { success: true, id: result.id };
    } catch (error) {
      logger.error("Error al enviar email", error, {
        to,
        subject,
      });
      throw error;
    }
  }

  // Plantillas de email
  async sendExpedienteNotification(data) {
    const { userId, expediente, action, comments } = data;

    // Obtener datos del usuario
    const user = await this.getUserById(userId);
    if (!user || !user.email) {
      logger.warn("Usuario sin email", { userId });
      return;
    }

    const subjects = {
      assigned: `Nuevo expediente asignado: ${expediente.caseNumber}`,
      approved: `Expediente aprobado: ${expediente.caseNumber}`,
      rejected: `Expediente rechazado: ${expediente.caseNumber}`,
      returned: `Expediente devuelto para revisión: ${expediente.caseNumber}`,
    };

    const html = this.getExpedienteEmailTemplate({
      userName: user.fullName,
      action,
      expediente,
      comments,
    });

    return this.sendEmail({
      to: user.email,
      subject:
        subjects[action] ||
        `Actualización de expediente: ${expediente.caseNumber}`,
      html,
    });
  }

  async sendNewsNotification(data) {
    const { userId, news, action } = data;

    const user = await this.getUserById(userId);
    if (!user || !user.email) {
      logger.warn("Usuario sin email", { userId });
      return;
    }

    const subjects = {
      pending_approval: `Nueva noticia para revisar: ${news.title}`,
      published: `Noticia publicada: ${news.title}`,
      rejected: `Noticia rechazada: ${news.title}`,
      court_submission: `Nuevo ${news.type} de juzgado`,
    };

    const html = this.getNewsEmailTemplate({
      userName: user.fullName,
      action,
      news,
    });

    return this.sendEmail({
      to: user.email,
      subject: subjects[action] || `Actualización de noticia`,
      html,
    });
  }

  async sendCitizenResponse(data) {
    const { citizenEmail, citizenName, subject, response } = data;

    const html = this.getCitizenResponseTemplate({
      citizenName,
      originalSubject: subject,
      response,
    });

    return this.sendEmail({
      to: citizenEmail,
      subject: `Re: ${subject}`,
      html,
      replyTo: this.fromEmail,
    });
  }

  async sendNewContactNotification(data) {
    const { userId, contact } = data;

    const user = await this.getUserById(userId);
    if (!user || !user.email) {
      logger.warn("Usuario sin email", { userId });
      return;
    }

    const html = this.getContactNotificationTemplate({
      userName: user.fullName,
      contact,
    });

    return this.sendEmail({
      to: user.email,
      subject: `Nuevo mensaje ciudadano: ${contact.subject}`,
      html,
    });
  }

  // Plantillas HTML
  getExpedienteEmailTemplate({ userName, action, expediente, comments }) {
    const actionMessages = {
      assigned: "Se le ha asignado un nuevo expediente para su revisión",
      approved: "Su expediente ha sido aprobado",
      rejected: "Su expediente ha sido rechazado",
      returned: "Su expediente ha sido devuelto para revisión",
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1a5490; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9f9f9; padding: 30px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          .button { display: inline-block; padding: 12px 24px; background-color: #1a5490; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          .details { background-color: white; padding: 15px; margin-top: 20px; border-left: 4px solid #1a5490; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Sistema Judicial de Guinea Ecuatorial</h1>
          </div>
          
          <div class="content">
            <h2>Estimado/a ${userName},</h2>
            
            <p>${actionMessages[action] || "Hay una actualización en un expediente"}.</p>
            
            <div class="details">
              <h3>Detalles del Expediente:</h3>
              <p><strong>Número de caso:</strong> ${expediente.caseNumber}</p>
              <p><strong>Título:</strong> ${expediente.title}</p>
              <p><strong>Estado actual:</strong> ${this.translateStatus(expediente.status)}</p>
              ${comments ? `<p><strong>Comentarios:</strong> ${comments}</p>` : ""}
            </div>
            
            <p>Por favor, acceda al sistema para más detalles y tomar las acciones necesarias.</p>
            
            <center>
              <a href="${process.env.FRONTEND_URL}/expedientes/${expediente.id}" class="button">
                Ver Expediente
              </a>
            </center>
          </div>
          
          <div class="footer">
            <p>Este es un correo automático del Sistema Judicial. Por favor, no responda a este mensaje.</p>
            <p>© ${new Date().getFullYear()} Poder Judicial de Guinea Ecuatorial</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getNewsEmailTemplate({ userName, action, news }) {
    const actionMessages = {
      pending_approval: "Tiene una nueva noticia pendiente de su aprobación",
      published: "Su noticia ha sido publicada exitosamente",
      rejected: "Su noticia ha sido rechazada y devuelta para revisión",
      court_submission: "Se ha recibido un nuevo contenido desde un juzgado",
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1a5490; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9f9f9; padding: 30px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          .button { display: inline-block; padding: 12px 24px; background-color: #1a5490; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          .news-type { display: inline-block; padding: 5px 10px; background-color: #e0e0e0; border-radius: 3px; font-size: 12px; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Sistema de Comunicación Judicial</h1>
          </div>
          
          <div class="content">
            <h2>Estimado/a ${userName},</h2>
            
            <p>${actionMessages[action] || "Hay una actualización en el sistema de noticias"}.</p>
            
            <div style="background-color: white; padding: 15px; margin-top: 20px;">
              <span class="news-type">${news.type}</span>
              <h3 style="margin-top: 10px;">${news.title}</h3>
              ${news.subtitle ? `<p style="color: #666;">${news.subtitle}</p>` : ""}
              <p><strong>Estado:</strong> ${this.translateNewsStatus(news.status)}</p>
            </div>
            
            <center>
              <a href="${process.env.FRONTEND_URL}/noticias/${news.id}" class="button">
                Ver Noticia
              </a>
            </center>
          </div>
          
          <div class="footer">
            <p>Este es un correo automático. Por favor, no responda a este mensaje.</p>
            <p>© ${new Date().getFullYear()} Poder Judicial de Guinea Ecuatorial</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getCitizenResponseTemplate({ citizenName, originalSubject, response }) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1a5490; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
          .response { background-color: #f0f7ff; padding: 20px; border-left: 4px solid #1a5490; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Poder Judicial de Guinea Ecuatorial</h1>
            <p style="margin: 0;">Respuesta a su consulta</p>
          </div>
          
          <div class="content">
            <h2>Estimado/a ${citizenName},</h2>
            
            <p>Hemos recibido su consulta con el asunto: "<strong>${originalSubject}</strong>"</p>
            
            <p>A continuación, le proporcionamos nuestra respuesta:</p>
            
            <div class="response">
              ${response}
            </div>
            
            <p>Si necesita información adicional, puede enviar una nueva consulta a través de nuestro portal web.</p>
            
            <p>Atentamente,</p>
            <p><strong>Secretaría del Poder Judicial</strong></p>
          </div>
          
          <div class="footer">
            <p>Este mensaje ha sido enviado desde una dirección de correo electrónico no monitorizada.</p>
            <p>Para nuevas consultas, utilice el formulario de contacto en nuestro sitio web.</p>
            <p>© ${new Date().getFullYear()} Poder Judicial de Guinea Ecuatorial - Todos los derechos reservados</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  getContactNotificationTemplate({ userName, contact }) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1a5490; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9f9f9; padding: 30px; margin-top: 20px; }
          .details { background-color: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #1a5490; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Nuevo Mensaje Ciudadano</h1>
          </div>
          
          <div class="content">
            <h2>Estimado/a ${userName},</h2>
            
            <p>Se ha recibido un nuevo mensaje a través del formulario de contacto ciudadano.</p>
            
            <div class="details">
              <h3>Datos del remitente:</h3>
              <p><strong>Nombre:</strong> ${contact.fullName}</p>
              <p><strong>DNI:</strong> ${contact.dni}</p>
              <p><strong>Email:</strong> ${contact.email}</p>
              <p><strong>Teléfono:</strong> ${contact.phone}</p>
              <p><strong>Asunto:</strong> ${contact.subject}</p>
              <p><strong>Mensaje:</strong></p>
              <p style="background-color: #f5f5f5; padding: 15px; border-left: 3px solid #1a5490;">
                ${contact.message}
              </p>
              ${contact.attachmentUrl ? "<p><strong>Nota:</strong> Este mensaje incluye un archivo adjunto.</p>" : ""}
            </div>
            
            <center>
              <a href="${process.env.FRONTEND_URL}/contacto/${contact.id}" class="button">
                Ver Mensaje Completo
              </a>
            </center>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Utilidades
  async getUserById(userId) {
    const users_result = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return users_result[0] || null;
  }

  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  translateStatus(status) {
    const translations = {
      draft: "Borrador",
      pending_approval: "Pendiente de aprobación",
      approved: "Aprobado",
      rejected: "Rechazado",
    };
    return translations[status] || status;
  }

  translateNewsStatus(status) {
    const translations = {
      draft: "Borrador",
      pending_director_approval: "Pendiente de aprobación del Director",
      pending_president_approval: "Pendiente de aprobación Presidencial",
      published: "Publicado",
    };
    return translations[status] || status;
  }
}

export default new EmailService();
