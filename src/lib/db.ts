import type { Client } from './types';

// This is a mock database. In a real application, you would use a real database.
// The data is not persisted between requests.
const memoryDB = {
  clients: [
    { id: "1", name: "Indústrias Acme Ltda.", cpfCnpj: "12.345.678/0001-99", type: "Pessoa Jurídica", email: "contato@acme.com", phone: "(11) 98765-4321", nationality: "Brasileira", maritalStatus: 'N/A', profession: 'Indústria', rg: 'N/A', rgIssuer: 'N/A', addressStreet: 'Rua dos Bobos', addressNumber: '0', addressDistrict: 'Centro', addressCity: 'São Paulo', addressState: 'SP', addressZipCode: '01001-000', createdAt: new Date().toISOString(), createdBy: 'system', updatedAt: new Date().toISOString(), updatedBy: 'system' },
    { id: "2", name: "João da Silva", cpfCnpj: "123.456.789-00", type: "Pessoa Física", email: "joao.silva@email.com", phone: "(21) 91234-5678", nationality: "Brasileiro", maritalStatus: 'Casado', profession: 'Advogado', rg: '12.345.678-9', rgIssuer: 'SSP/RJ', addressStreet: 'Avenida Principal', addressNumber: '123', addressDistrict: 'Copacabana', addressCity: 'Rio de Janeiro', addressState: 'RJ', addressZipCode: '22000-000', createdAt: new Date().toISOString(), createdBy: 'system', updatedAt: new Date().toISOString(), updatedBy: 'system' },
    { id: "3", name: "Maria Oliveira", cpfCnpj: "987.654.321-11", type: "Pessoa Física", email: "maria.o@email.com", phone: "(31) 95555-4444", nationality: "Brasileira", maritalStatus: 'Solteira', profession: 'Médica', rg: 'MG-11.222.333', rgIssuer: 'SSP/MG', addressStreet: 'Rua das Flores', addressNumber: '456', addressDistrict: 'Savassi', addressCity: 'Belo Horizonte', addressState: 'MG', addressZipCode: '30110-000', createdAt: new Date().toISOString(), createdBy: 'system', updatedAt: new Date().toISOString(), updatedBy: 'system' },
    { id: "4", name: "Tech Solutions S.A.", cpfCnpj: "98.765.432/0001-11", type: "Pessoa Jurídica", email: "financeiro@techsolutions.com", phone: "(41) 98888-7777", nationality: "Brasileira", maritalStatus: 'N/A', profession: 'Tecnologia', rg: 'N/A', rgIssuer: 'N/A', addressStreet: 'Alameda Inovação', addressNumber: '789', addressDistrict: 'Centro Cívico', addressCity: 'Curitiba', addressState: 'PR', addressZipCode: '80530-909', createdAt: new Date().toISOString(), createdBy: 'system', updatedAt: new Date().toISOString(), updatedBy: 'system' },
    { id: "5", name: "Pedro Martins", cpfCnpj: "456.123.789-22", type: "Pessoa Física", email: "pedromartins@email.com", phone: "(51) 99111-2222", nationality: "Brasileiro", maritalStatus: 'Divorciado', profession: 'Engenheiro', rg: '45.612.378-9', rgIssuer: 'SSP/RS', addressStreet: 'Avenida Ipiranga', addressNumber: '1011', addressDistrict: 'Partenon', addressCity: 'Porto Alegre', addressState: 'RS', addressZipCode: '90650-001', createdAt: new Date().toISOString(), createdBy: 'system', updatedAt: new Date().toISOString(), updatedBy: 'system' },
  ] as Client[],
};

export default memoryDB;
