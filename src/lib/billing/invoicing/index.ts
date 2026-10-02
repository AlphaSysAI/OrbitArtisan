/**
 * Point d'entrée public du module de facturation : seule la fabrique du service
 * est consommée hors du module (import dynamique depuis les server actions).
 * Les autres briques s'importent par leur chemin direct.
 */
export { createInvoiceService } from "./create-invoice-service";
