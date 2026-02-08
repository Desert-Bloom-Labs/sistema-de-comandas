import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertCircle,
  Calendar,
  CheckCircle as CheckCircleIcon,
  Clock,
  CreditCard,
  Edit,
  Plus,
  Settings,
  Table,
  Trash2,
  XCircle,
} from 'lucide-react';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useApp } from '../../shared/contexts/AppContext';
import { useActiveTabState } from '../../shared/hooks/useTabState';
import { logsService } from '../../shared/services/logsService';
import ReservationModal from './components/ReservationModal';
import ReservationsCalendar from './components/ReservationsCalendar';
import { reservationService } from './services/reservationService';
import { ReservationStatus, ReservationWithTable } from './types/reservation';

interface TableData {
  id: string;
  number: number;
  name: string;
  capacity: number;
  status: 'free' | 'occupied' | 'reserved' | 'cleaning';
  position_x: number;
  position_y: number;
  current_order_id?: string;
  created_at: string;
  updated_at: string;
}

interface Order {
  id: string;
  order_number: string;
  customer_name?: string;
  total_amount: number;
  created_at: string;
  notes?: string;
}

const statusConfig = {
  free: {
    label: 'Libre',
    icon: Table,
    color: 'text-success-600',
    bg: 'bg-success-50',
    border: 'border-success-200',
  },
  occupied: {
    label: 'Ocupada',
    icon: Clock,
    color: 'text-warning-600',
    bg: 'bg-warning-50',
    border: 'border-warning-200',
  },
  reserved: {
    label: 'Reservada',
    icon: XCircle,
    color: 'text-danger-600',
    bg: 'bg-danger-50',
    border: 'border-danger-200',
  },
  cleaning: {
    label: 'Limpieza',
    icon: Settings,
    color: 'text-info-600',
    bg: 'bg-info-50',
    border: 'border-info-200',
  },
};

const tableSchema = z.object({
  number: z.number().min(1, 'El número de mesa es requerido'),
  name: z.string().min(1, 'El nombre es requerido'),
  capacity: z.number().min(1, 'La capacidad debe ser al menos 1'),
});

type TableFormData = z.infer<typeof tableSchema>;

export default function Tables() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTable, setEditingTable] = useState<TableData | null>(null);
  const [selectedTable, setSelectedTable] = useActiveTabState<TableData | null>(
    'selectedTable',
    null,
    true
  );
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState<string | null>(
    null
  );
  const [showErrorMessage, setShowErrorMessage] = useState<string | null>(null);

  // Estados para las reservas
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [reservations, setReservations] = useState<ReservationWithTable[]>([]);
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);

  const queryClient = useQueryClient();
  const { openModule } = useApp();

  // Get next available table number
  const { data: nextTableNumber } = useQuery<number>({
    queryKey: ['next-table-number'],
    queryFn: () => invoke('get_next_table_number_command'),
    enabled: showAddModal,
  });

  const {
    data: tables = [],
    isLoading,
    error,
    refetch,
  } = useQuery<TableData[]>(
    ['tables'],
    () => invoke<TableData[]>('get_tables'),
    {
      retry: 3,
      refetchOnWindowFocus: true,
      staleTime: 0,
      refetchInterval: 2000,
      cacheTime: 0,
    }
  );

  // Removed orders query since orders functionality has been removed
  const orders: Order[] = [];

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TableFormData>({
    resolver: zodResolver(tableSchema),
    defaultValues: {
      number: 1,
      name: '',
      capacity: 4,
    },
  });

  // Actualizar el número automáticamente cuando esté disponible
  React.useEffect(() => {
    if (nextTableNumber && showAddModal) {
      setValue('number', nextTableNumber);
    }
  }, [nextTableNumber, showAddModal, setValue]);

  // Generar automáticamente el nombre de la mesa
  const tableNumber = watch('number');
  React.useEffect(() => {
    if (tableNumber && showAddModal) {
      setValue('name', `Mesa ${tableNumber}`);
    }
  }, [tableNumber, showAddModal, setValue]);

  const {
    register: editRegister,
    handleSubmit: editHandleSubmit,
    reset: editReset,
    formState: { errors: editErrors },
  } = useForm<TableFormData>({
    resolver: zodResolver(tableSchema),
  });

  const createTableMutation = useMutation({
    mutationFn: (data: TableFormData) =>
      invoke<TableData>('create_table', { request: data }),
    onSuccess: newTable => {
      // Actualizar el caché inmediatamente
      queryClient.setQueryData<TableData[]>(['tables'], oldData => {
        return oldData ? [...oldData, newTable] : [newTable];
      });

      setShowAddModal(false);
      reset();
      setShowSuccessMessage('¡Mesa creada exitosamente!');
      setTimeout(() => setShowSuccessMessage(null), 3000);
    },
    onError: error => {
      setShowErrorMessage('Error al crear mesa: ' + error);
      setTimeout(() => setShowErrorMessage(null), 5000);
    },
  });

  const updateTableMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TableFormData }) =>
      invoke('update_table_command', { id, request: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setShowEditModal(false);
      setEditingTable(null);
      editReset();
      setShowSuccessMessage('¡Mesa actualizada exitosamente!');
      setTimeout(() => setShowSuccessMessage(null), 3000);
    },
    onError: error => {
      setShowErrorMessage('Error al actualizar mesa: ' + error);
      setTimeout(() => setShowErrorMessage(null), 5000);
    },
  });

  const deleteTableMutation = useMutation({
    mutationFn: (id: string) => invoke('delete_table_command', { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setShowSuccessMessage('¡Mesa eliminada exitosamente!');
      setTimeout(() => setShowSuccessMessage(null), 3000);
    },
    onError: error => {
      setShowErrorMessage('Error al eliminar mesa: ' + error);
      setTimeout(() => setShowErrorMessage(null), 5000);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const result = await invoke('update_table_command', {
        id,
        request: { status },
      });

      // Enregistrer le changement de statut dans les logs
      const table = tables.find(t => t.id === id);
      if (table) {
        await logsService.logTableStatusChange(
          id,
          table.name,
          table.status,
          status
        );
      }

      return result;
    },
    onSuccess: (_data, variables) => {
      // Mettre à jour le cache immédiatement avec le nouveau statut
      queryClient.setQueryData<TableData[]>(['tables'], oldData => {
        if (!oldData) return oldData;
        return oldData.map(table =>
          table.id === variables.id
            ? { ...table, status: variables.status as TableData['status'] }
            : table
        );
      });

      // Forcer un refetch pour s'assurer de la synchronisation
      setTimeout(() => {
        refetch();
      }, 100);

      setShowSuccessMessage('¡Estado de mesa actualizado!');
      setTimeout(() => setShowSuccessMessage(null), 3000);
    },
    onError: (error, _variables) => {
      setShowErrorMessage('Error al actualizar estado: ' + error);
      setTimeout(() => setShowErrorMessage(null), 5000);
    },
  });

  const onSubmit = (data: TableFormData) => {
    createTableMutation.mutate(data);
  };

  const onEditSubmit = (data: TableFormData) => {
    if (editingTable) {
      updateTableMutation.mutate({ id: editingTable.id, data });
    }
  };

  const handleEdit = (table: TableData) => {
    setEditingTable(table);
    editReset({
      number: table.number,
      name: table.name,
      capacity: table.capacity,
    });
    setShowEditModal(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`¿Estás seguro de que deseas eliminar la mesa "${name}" ?`)) {
      deleteTableMutation.mutate(id);
    }
  };

  // handleTableClick removed as it's not used

  const handleTakeOrder = (table: TableData) => {
    openModule('pos', { selectedTable: table });
  };

  // Fonctions pour les réservations
  const loadReservations = async (date: Date) => {
    setIsLoadingReservations(true);
    try {
      const dateString = date.toISOString().split('T')[0];
      const reservationsData =
        await reservationService.getReservationsWithTableInfo(dateString);
      // Filtrer les réservations annulées pour un affichage plus compact
      const activeReservations = reservationsData.filter(
        reservation => reservation.status !== 'cancelled'
      );
      setReservations(activeReservations);
    } catch (error) {
      console.error('Error loading reservations:', error);
      setShowErrorMessage('Erreur lors du chargement des réservations');
      setTimeout(() => setShowErrorMessage(null), 3000);
    } finally {
      setIsLoadingReservations(false);
    }
  };

  const handleReservationCreated = (_reservation: any) => {
    // Mettre à jour le statut de la table à "reserved"
    if (selectedTable) {
      updateStatusMutation.mutate({ id: selectedTable.id, status: 'reserved' });
    }

    setShowSuccessMessage('¡Reservación creada exitosamente!');
    setTimeout(() => setShowSuccessMessage(null), 3000);
    loadReservations(selectedDate);

    // Fermer le modal
    setShowReservationModal(false);
    setSelectedTable(null);
  };

  const handleReservationClick = (reservation: ReservationWithTable) => {
    // Ouvrir le modal d'édition ou afficher les détails
    console.log('Reservation clicked:', reservation);
  };

  const handleReservationStatusChange = async (
    reservationId: string,
    status: ReservationStatus
  ) => {
    try {
      await reservationService.updateReservationStatus(reservationId, status);

      const reservation = reservations.find(r => r.id === reservationId);
      if (reservation) {
        // Gérer les changements de statut de table selon le statut de réservation
        if (status === 'cancelled' || status === 'completed') {
          // Annulée ou terminée -> table libre
          updateStatusMutation.mutate({
            id: reservation.table_id,
            status: 'free',
          });
        } else if (status === 'confirmed') {
          // Confirmée -> table réservée (déjà fait lors de la création)
          updateStatusMutation.mutate({
            id: reservation.table_id,
            status: 'reserved',
          });
        } else if (status === 'arrived') {
          // Arrivée -> table occupée
          updateStatusMutation.mutate({
            id: reservation.table_id,
            status: 'occupied',
          });
        }
      }

      setShowSuccessMessage('¡Estado de reservación actualizado!');
      setTimeout(() => setShowSuccessMessage(null), 3000);
      loadReservations(selectedDate);
    } catch (error) {
      setShowErrorMessage('Error al actualizar estado de reservación');
      setTimeout(() => setShowErrorMessage(null), 3000);
    }
  };

  const handleStatusChange = (tableId: string, status: TableData['status']) => {
    if (status === 'reserved') {
      // Ouvrir le modal de réservation
      const table = tables.find(t => t.id === tableId);
      if (table) {
        setSelectedTable(table);
        setShowReservationModal(true);
      }
    } else {
      // Mettre à jour le statut normalement
      updateStatusMutation.mutate({ id: tableId, status });
    }
  };

  // Charger les réservations au montage et quand la date change
  React.useEffect(() => {
    loadReservations(selectedDate);
  }, [selectedDate]);

  const getTableOrders = (tableNumber: number) => {
    return (
      orders?.filter(order => order.notes?.includes(`Table ${tableNumber}`)) ||
      []
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">Error al cargar mesas</p>
          <p className="text-sm text-gray-500 mt-2">{String(error)}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Gestión de Mesas
            </h1>
            <p className="text-gray-600">Plan y estado de mesas</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Agregar Mesa
          </button>
        </div>
      </div>

      {/* Success/Error Messages */}
      {showSuccessMessage && (
        <div className="mb-6 p-4 bg-success-50 border border-success-200 rounded-lg flex items-center">
          <CheckCircleIcon className="w-5 h-5 text-success-600 mr-3" />
          <span className="text-success-800">{showSuccessMessage}</span>
        </div>
      )}

      {showErrorMessage && (
        <div className="mb-6 p-4 bg-danger-50 border border-danger-200 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 text-danger-600 mr-3" />
          <span className="text-danger-800">{showErrorMessage}</span>
        </div>
      )}

      {/* Status Legend */}
      <div className="mb-6">
        <div className="flex items-center space-x-6">
          {Object.entries(statusConfig).map(([status, config]) => {
            const Icon = config.icon;
            return (
              <div key={status} className="flex items-center">
                <Icon className={`w-4 h-4 mr-2 ${config.color}`} />
                <span className="text-sm text-gray-600">{config.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Planning des réservations */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Planificación
            </h2>
          </div>
        </div>

        {isLoadingReservations ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="ml-3 text-gray-600">
              Cargando reservaciones...
            </span>
          </div>
        ) : (
          <ReservationsCalendar
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            reservations={reservations}
            onReservationClick={handleReservationClick}
            onReservationStatusChange={handleReservationStatusChange}
          />
        )}
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {tables.map((table: TableData) => {
          const status = statusConfig[table.status] || statusConfig.free;
          const StatusIcon = status.icon;
          const tableOrders = getTableOrders(table.number);

          return (
            <div
              key={table.id}
              className={`card p-6 border-2 transition-all duration-200 hover:shadow-lg ${
                table.status === 'occupied'
                  ? 'border-warning-200 bg-warning-50/30'
                  : table.status === 'reserved'
                    ? 'border-danger-200 bg-danger-50/30'
                    : table.status === 'cleaning'
                      ? 'border-info-200 bg-info-50/30'
                      : 'border-success-200 bg-success-50/30'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <div className={`p-3 rounded-xl ${status.bg} shadow-sm`}>
                    <StatusIcon className={`w-6 h-6 ${status.color}`} />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {table.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Mesa #{table.number}
                    </p>
                  </div>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => handleTakeOrder(table)}
                    className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    title="Tomar Pedido"
                  >
                    <CreditCard className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEdit(table)}
                    className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    title="Editar Mesa"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(table.id, table.name)}
                    className="p-2 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                    title="Eliminar Mesa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Capacidad:</span>
                  <span className="font-medium bg-gray-100 px-2 py-1 rounded-full text-xs">
                    {table.capacity} personas
                  </span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Estado:</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color} shadow-sm`}
                  >
                    {status.label}
                  </span>
                </div>

                {tableOrders.length > 0 && (
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-500 mb-2">
                      Pedidos Recientes:
                    </p>
                    {tableOrders.slice(0, 2).map(order => (
                      <div
                        key={order.id}
                        className="flex justify-between text-xs text-gray-600 bg-gray-50 p-2 rounded"
                      >
                        <span>#{order.order_number}</span>
                        <span className="font-medium">
                          {order.total_amount.toFixed(2)} €
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Change Buttons */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">Cambiar Estado:</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(statusConfig).map(([statusKey, config]) => (
                    <button
                      key={statusKey}
                      onClick={() =>
                        handleStatusChange(
                          table.id,
                          statusKey as TableData['status']
                        )
                      }
                      disabled={
                        table.status === statusKey ||
                        updateStatusMutation.isPending
                      }
                      className={`px-3 py-2 text-xs rounded-lg transition-all duration-200 font-medium ${
                        table.status === statusKey
                          ? `${config.bg} ${config.color} cursor-default shadow-sm`
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:shadow-sm disabled:opacity-50'
                      }`}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {tables.length === 0 && (
        <div className="text-center py-12">
          <Table className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Sin Mesas</h3>
          <p className="text-gray-500 mb-4">Comienza creando tu primera mesa</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary"
          >
            Crear Mesa
          </button>
        </div>
      )}

      {/* Add Table Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Nueva Mesa</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Número de Mesa *
                  {nextTableNumber && (
                    <span className="text-xs text-gray-500 ml-2">
                      (Siguiente disponible: {nextTableNumber})
                    </span>
                  )}
                </label>
                <input
                  {...register('number', { valueAsNumber: true })}
                  type="number"
                  className="input"
                  placeholder="1"
                  min="1"
                />
                {errors.number && (
                  <p className="text-danger-600 text-sm mt-1">
                    {errors.number.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Nombre *
                </label>
                <input
                  {...register('name')}
                  className="input"
                  placeholder="Mesa 1"
                />
                {errors.name && (
                  <p className="text-danger-600 text-sm mt-1">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Capacidad *
                </label>
                <select
                  {...register('capacity', { valueAsNumber: true })}
                  className="input"
                >
                  <option value={2}>2 personas</option>
                  <option value={4}>4 personas</option>
                  <option value={6}>6 personas</option>
                  <option value={8}>8 personas</option>
                  <option value={10}>10 personas</option>
                  <option value={12}>12 personas</option>
                </select>
                {errors.capacity && (
                  <p className="text-danger-600 text-sm mt-1">
                    {errors.capacity.message}
                  </p>
                )}
              </div>

              <div className="bg-info-50 border border-info-200 rounded-lg p-3">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <Table className="w-5 h-5 text-info-600" />
                  </div>
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-info-800">
                      Consejos
                    </h4>
                    <div className="mt-1 text-sm text-info-700">
                      <p>
                        • El número será verificado automáticamente para evitar
                        duplicados
                      </p>
                      <p>
                        • El nombre se generará automáticamente según el número
                      </p>
                      <p>• Puedes modificar el estado después de la creación</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createTableMutation.isPending}
                  className="flex-1 btn btn-primary disabled:opacity-50"
                >
                  {createTableMutation.isPending ? 'Creando...' : 'Crear Mesa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Table Modal */}
      {showEditModal && editingTable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Editar Mesa</h3>

            <form
              onSubmit={editHandleSubmit(onEditSubmit)}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-2">
                  Número de Mesa *
                </label>
                <input
                  {...editRegister('number', { valueAsNumber: true })}
                  type="number"
                  className="input"
                  placeholder="1"
                />
                {editErrors.number && (
                  <p className="text-danger-600 text-sm mt-1">
                    {editErrors.number.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Name *</label>
                <input
                  {...editRegister('name')}
                  className="input"
                  placeholder="Table 1"
                />
                {editErrors.name && (
                  <p className="text-danger-600 text-sm mt-1">
                    {editErrors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Capacity *
                </label>
                <input
                  {...editRegister('capacity', { valueAsNumber: true })}
                  type="number"
                  className="input"
                  placeholder="4"
                />
                {editErrors.capacity && (
                  <p className="text-danger-600 text-sm mt-1">
                    {editErrors.capacity.message}
                  </p>
                )}
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingTable(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updateTableMutation.isPending}
                  className="flex-1 btn btn-primary disabled:opacity-50"
                >
                  {updateTableMutation.isPending
                    ? 'Actualizando...'
                    : 'Actualizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {showOrderModal && selectedTable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-4">
              Detalles de Mesa {selectedTable.name}
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Número:</span>
                  <p className="font-medium">{selectedTable.number}</p>
                </div>
                <div>
                  <span className="text-gray-500">Capacidad:</span>
                  <p className="font-medium">
                    {selectedTable.capacity} personas
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Estado:</span>
                  <p className="font-medium">
                    {statusConfig[selectedTable.status].label}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Posición:</span>
                  <p className="font-medium">
                    ({selectedTable.position_x}, {selectedTable.position_y})
                  </p>
                </div>
              </div>

              {selectedTable.current_order_id && (
                <div className="pt-4 border-t border-gray-100">
                  <h4 className="font-medium mb-2">Pedido Actual</h4>
                  <p className="text-sm text-gray-600">
                    ID: {selectedTable.current_order_id}
                  </p>
                </div>
              )}

              <div className="pt-4 border-t border-gray-100">
                <h4 className="font-medium mb-2">Historial de Pedidos</h4>
                {getTableOrders(selectedTable.number).length > 0 ? (
                  <div className="space-y-2">
                    {getTableOrders(selectedTable.number).map(order => (
                      <div
                        key={order.id}
                        className="flex justify-between text-sm p-2 bg-gray-50 rounded"
                      >
                        <span>#{order.order_number}</span>
                        <span className="font-medium">
                          {order.total_amount.toFixed(2)} €
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Sin pedidos para esta mesa
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setShowOrderModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de réservation */}
      {showReservationModal && selectedTable && (
        <ReservationModal
          table={selectedTable}
          isOpen={showReservationModal}
          onClose={() => {
            setShowReservationModal(false);
            setSelectedTable(null);
          }}
          onReservationCreated={handleReservationCreated}
        />
      )}
    </div>
  );
}
