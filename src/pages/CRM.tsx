import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Users, Mail, Phone, Calendar, MessageSquare, Eye } from 'lucide-react';

interface Lead {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  industry?: string;
  stage: string;
  conversation_history: any;
  appointment_id?: string;
  appointments?: {
    title: string;
    date: string;
    start_time: string;
    end_time: string;
  };
  created_at: string;
  updated_at: string;
}

export default function CRMPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from('leads')
      .select(`
        *,
        appointments (
          title,
          date,
          start_time,
          end_time
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Error fetching leads');
      console.error(error);
    } else {
      setLeads(data || []);
    }
    setLoading(false);
  };

  const getStageColor = (stage: string) => {
    const colors: { [key: string]: string } = {
      'greeting': 'bg-blue-100 text-blue-800',
      'asking_name': 'bg-yellow-100 text-yellow-800',
      'industry': 'bg-purple-100 text-purple-800',
      'pain_points': 'bg-orange-100 text-orange-800',
      'explaining': 'bg-pink-100 text-pink-800',
      'collecting_phone': 'bg-indigo-100 text-indigo-800',
      'collecting_email': 'bg-cyan-100 text-cyan-800',
      'collecting_name': 'bg-teal-100 text-teal-800',
      'collecting_city': 'bg-emerald-100 text-emerald-800',
      'booking': 'bg-amber-100 text-amber-800',
      'confirmed': 'bg-green-100 text-green-800'
    };
    return colors[stage] || 'bg-gray-100 text-gray-800';
  };

  const handleViewLead = (lead: Lead) => {
    setSelectedLead(lead);
    setIsDialogOpen(true);
  };

  const handleDeleteLead = async (id: string) => {
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Error deleting lead');
      console.error(error);
    } else {
      toast.success('Lead deleted successfully');
      fetchLeads();
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="w-8 h-8" />
            CRM Dashboard
          </h1>
          <div className="text-sm text-muted-foreground">
            Total Leads: {leads.length}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div>Loading leads...</div>
          </div>
        ) : leads.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No leads yet</h3>
              <p className="text-muted-foreground">
                Leads will appear here when users interact with the AI chat
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {leads.map((lead) => (
              <Card key={lead.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">
                      {lead.name || 'Anonymous Lead'}
                    </CardTitle>
                    <Badge className={getStageColor(lead.stage)}>
                      {lead.stage.replace('_', ' ')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {lead.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span>{lead.email}</span>
                      </div>
                    )}
                    {lead.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{lead.phone}</span>
                      </div>
                    )}
                    {lead.industry && (
                      <div className="text-sm">
                        <span className="font-medium">Industry:</span> {lead.industry}
                      </div>
                    )}
                    {lead.appointments && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>{format(new Date(lead.appointments.date), 'MMM dd, yyyy')} at {lead.appointments.start_time}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    Created: {format(new Date(lead.created_at), 'MMM dd, yyyy HH:mm')}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewLead(lead)}
                      className="flex-1"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteLead(lead.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Lead Details: {selectedLead?.name || 'Anonymous Lead'}
              </DialogTitle>
            </DialogHeader>
            
            {selectedLead && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">Contact Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div><strong>Name:</strong> {selectedLead.name || 'Not provided'}</div>
                      <div><strong>Email:</strong> {selectedLead.email || 'Not provided'}</div>
                      <div><strong>Phone:</strong> {selectedLead.phone || 'Not provided'}</div>
                      <div><strong>Industry:</strong> {selectedLead.industry || 'Not provided'}</div>
                      <div><strong>Stage:</strong> 
                        <Badge className={`ml-2 ${getStageColor(selectedLead.stage)}`}>
                          {selectedLead.stage.replace('_', ' ')}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  {selectedLead.appointments && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Appointment</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div><strong>Title:</strong> {selectedLead.appointments.title}</div>
                          <div><strong>Date:</strong> {format(new Date(selectedLead.appointments.date), 'MMM dd, yyyy')}</div>
                          <div><strong>Time:</strong> {selectedLead.appointments.start_time} - {selectedLead.appointments.end_time}</div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MessageSquare className="w-5 h-5" />
                      Conversation History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64 w-full">
                      <div className="space-y-3">
                        {Array.isArray(selectedLead.conversation_history) ? selectedLead.conversation_history.map((msg: any, index: number) => (
                          <div
                            key={index}
                            className={`p-3 rounded-lg ${
                              msg.isUser 
                                ? 'bg-blue-100 ml-8' 
                                : 'bg-gray-100 mr-8'
                            }`}
                          >
                            <div className="text-sm font-medium mb-1">
                              {msg.isUser ? 'Lead' : 'Sky AI'}
                            </div>
                            <div className="text-sm">{msg.text}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {format(new Date(msg.timestamp), 'MMM dd, HH:mm')}
                            </div>
                          </div>
                        )) : (
                          <div className="text-muted-foreground text-sm">No conversation history available</div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}