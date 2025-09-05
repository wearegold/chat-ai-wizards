-- Create appointments table for calendar
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create leads table for CRM
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  email TEXT,
  phone TEXT,
  industry TEXT,
  stage TEXT NOT NULL DEFAULT 'greeting',
  conversation_history JSONB NOT NULL DEFAULT '[]',
  appointment_id UUID REFERENCES public.appointments(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Create policies for appointments (public access for now)
CREATE POLICY "Anyone can view appointments" 
ON public.appointments 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create appointments" 
ON public.appointments 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update appointments" 
ON public.appointments 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete appointments" 
ON public.appointments 
FOR DELETE 
USING (true);

-- Create policies for leads (public access for now)
CREATE POLICY "Anyone can view leads" 
ON public.leads 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create leads" 
ON public.leads 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update leads" 
ON public.leads 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete leads" 
ON public.leads 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();