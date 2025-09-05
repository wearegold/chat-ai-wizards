import React, { useState, useEffect } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Plus, Clock, Calendar as CalendarIcon } from 'lucide-react';

interface Appointment {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  description?: string;
}

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAppointment, setNewAppointment] = useState({
    title: '',
    start_time: '',
    end_time: '',
    description: ''
  });

  useEffect(() => {
    if (selectedDate) {
      fetchAppointments();
    }
  }, [selectedDate]);

  const fetchAppointments = async () => {
    if (!selectedDate) return;
    
    setLoading(true);
    const formattedDate = format(selectedDate, 'yyyy-MM-dd');
    
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('date', formattedDate)
      .order('start_time');

    if (error) {
      toast.error('Error fetching appointments');
      console.error(error);
    } else {
      setAppointments(data || []);
    }
    setLoading(false);
  };

  const handleCreateAppointment = async () => {
    if (!selectedDate || !newAppointment.title || !newAppointment.start_time || !newAppointment.end_time) {
      toast.error('Please fill in all required fields');
      return;
    }

    const formattedDate = format(selectedDate, 'yyyy-MM-dd');
    
    const { error } = await supabase
      .from('appointments')
      .insert({
        title: newAppointment.title,
        date: formattedDate,
        start_time: newAppointment.start_time,
        end_time: newAppointment.end_time,
        description: newAppointment.description
      });

    if (error) {
      toast.error('Error creating appointment');
      console.error(error);
    } else {
      toast.success('Appointment created successfully');
      setNewAppointment({ title: '', start_time: '', end_time: '', description: '' });
      setIsDialogOpen(false);
      fetchAppointments();
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Error deleting appointment');
      console.error(error);
    } else {
      toast.success('Appointment deleted successfully');
      fetchAppointments();
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Calendar Management</h1>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Appointment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Appointment</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={newAppointment.title}
                    onChange={(e) => setNewAppointment(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Appointment title"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start_time">Start Time *</Label>
                    <Input
                      id="start_time"
                      type="time"
                      value={newAppointment.start_time}
                      onChange={(e) => setNewAppointment(prev => ({ ...prev, start_time: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="end_time">End Time *</Label>
                    <Input
                      id="end_time"
                      type="time"
                      value={newAppointment.end_time}
                      onChange={(e) => setNewAppointment(prev => ({ ...prev, end_time: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={newAppointment.description}
                    onChange={(e) => setNewAppointment(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                  />
                </div>
                <Button onClick={handleCreateAppointment} className="w-full">
                  Create Appointment
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5" />
                Select Date
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="rounded-md border"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Appointments for {selectedDate ? format(selectedDate, 'MMM dd, yyyy') : 'Select a date'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div>Loading appointments...</div>
              ) : appointments.length === 0 ? (
                <div className="text-muted-foreground">No appointments for this date</div>
              ) : (
                <div className="space-y-3">
                  {appointments.map((appointment) => (
                    <div key={appointment.id} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium">{appointment.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {appointment.start_time} - {appointment.end_time}
                          </p>
                          {appointment.description && (
                            <p className="text-sm mt-1">{appointment.description}</p>
                          )}
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteAppointment(appointment.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}