import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';

@Entity('mensaje')
export class Mensaje {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36 })
  remitenteId: string;

  @Column({ length: 36 })
  destinatarioId: string;

  @Column('text')
  contenido: string;

  @Column({ length: 36, nullable: true })
  vehiculoId: string;

  @Column({ default: false })
  leido: boolean;

  @CreateDateColumn()
  fechaCreacion: Date;

  // We could add relations here if we had the User/Vehicle entities in this microservice,
  // but for simplicity and decoupling, we might just store the IDs or duplicate the entities if needed.
  // Given the user wants integration with sql.sql, let's assume we just store IDs for now 
  // to avoid importing the whole User/Vehicle entity definition which might be complex.
  // However, TypeORM works best with relations. Let's define minimal entities for relations if needed,
  // or just stick to IDs if we don't need to join in this service.
  // The original code didn't join, just inserted.
}
