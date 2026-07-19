import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Label, Badge } from "../components/ui";
import { ArrowLeft, Save, Zap, Droplets, Utensils, Shirt, Mail, Phone, Lock, Award } from "lucide-react"; 
import { toast } from "sonner";

/**
 * Guest Entry Component
 * Allows authorized staff or system to view and edit a specific guest's consumption data.
 */
export default function GuestEntry() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  
  // State Initialization: Tries navigation state first, then localStorage (for refresh resilience)
  const [entry, setEntry] = useState(() => {
    if (state?.guest) return state.guest;

    const stored = localStorage.getItem("current_guest_edit");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.bookingId === id) return parsed;
      } catch (e) {
        console.error("Failed to parse stored guest data");
      }
    }
    return null;
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Effect: Syncs current guest entry to localStorage for persistence
  useEffect(() => {
    if (entry) {
      localStorage.setItem("current_guest_edit", JSON.stringify(entry));
    }
  }, [entry]);

  // Effect: Validate entry and redirect if missing
  useEffect(() => {
    if (!entry) {
      toast.error("Guest data not found. Redirecting to dashboard.");
      navigate("/hotel-dashboard");
      return;
    }

    // Force view-only mode if the guest has already checked out
    if (entry.status === 'checked-out') {
      setIsEditing(false); 
    }
  }, [entry, navigate]); 

  /**
   * Enables edit mode and populates the form with current values
   */
  const startEditing = () => {
    if (entry.status === 'checked-out') {
        toast.error("Cannot edit data for a checked-out guest.");
        return;
    }
    
    setEditForm({ 
      electricity: entry.electricity || 0, 
      water: entry.water || 0, 
      laundry: entry.laundry || 0, 
      meals: entry.meals || 0 
    });
    setIsEditing(true);
  };

  /**
   * Submits updated consumption data to the API
   */
  const handleUpdate = async (e) => {
    e.preventDefault();

    if (entry.status === 'checked-out') {
      toast.error("This record is finalized and cannot be updated.");
      setIsEditing(false);
      return;
    }
    
    const payload = {
      electricity: Number(editForm.electricity),
      water: Number(editForm.water),
      laundry: Number(editForm.laundry),
      meals: Number(editForm.meals),
      bookingId: entry.bookingId,
      hotel_id: entry.hotel_id,
      status: 'update-stats' 
    };

    try {
      const saveRes = await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await saveRes.json();
      if (!saveRes.ok) throw new Error("Update failed");

      // Update local state with the backend response (which includes recalc stats like CO2)
      setEntry(prev => ({ 
          ...prev, 
          ...payload, 
          co2: data.co2,
          discount: data.discount,
      }));
      setIsEditing(false);
      toast.success("Guest stats updated successfully");

    } catch (error) {
      console.error(error);
      toast.error("Failed to update guest");
    }
  };

  if (!entry) return null;

  const isCheckedOut = entry.status === 'checked-out';

  return (
    <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/hotel-dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Button>
        </div>

        <Card className={`border-t-4 ${isCheckedOut ? 'border-t-slate-400' : 'border-t-primary'}`}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Guest Details: {entry.name}</CardTitle>
                <p className="text-sm text-slate-500 font-mono mt-1">{entry.bookingId}</p>
              </div>
              <Badge variant={isCheckedOut ? 'default' : 'warning'} className="text-sm px-3 py-1">
                  {isCheckedOut ? 'Checked Out' : 'Active Stay'}
              </Badge>
            </div>
            <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
               <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Current Impact</span>
               <span className="text-3xl font-bold text-primary">{entry.co2} <span className="text-lg font-normal text-slate-400">kg CO₂</span></span>
            </div>
          </CardHeader>
          <CardContent>
            {/* Render Logic: 
                - If checked out OR not editing: Show read-only stats
                - If active AND editing: Show input form
            */}
            {isCheckedOut || !isEditing ? (
              <div className="space-y-6">
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-lg border border-slate-200 flex items-center"><Mail className="w-4 h-4 mr-2 text-slate-400"/> <span className="truncate">{entry.email}</span></div>
                  <div className="p-3 rounded-lg border border-slate-200 flex items-center"><Phone className="w-4 h-4 mr-2 text-slate-400"/> {entry.phone}</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
                    <div className="text-xs text-amber-600 font-semibold uppercase mb-1">Electricity</div>
                    <div className="text-xl font-bold text-amber-900"><Zap className="inline w-4 h-4 mr-1 mb-1"/> {entry.electricity} kWh</div>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <div className="text-xs text-blue-600 font-semibold uppercase mb-1">Water</div>
                    <div className="text-xl font-bold text-blue-900"><Droplets className="inline w-4 h-4 mr-1 mb-1"/> {entry.water} L</div>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                    <div className="text-xs text-purple-600 font-semibold uppercase mb-1">Laundry</div>
                    <div className="text-xl font-bold text-purple-900"><Shirt className="inline w-4 h-4 mr-1 mb-1"/> {entry.laundry} kg</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                    <div className="text-xs text-green-600 font-semibold uppercase mb-1">Meals</div>
                    <div className="text-xl font-bold text-green-900"><Utensils className="inline w-4 h-4 mr-1 mb-1"/> {entry.meals} Count</div>
                  </div>
                </div>
                
                {isCheckedOut ? (
                    <div className="p-4 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 font-semibold flex items-center justify-center gap-2">
                        <Lock className="w-5 h-5"/> Record Finalized. No further edits allowed.
                    </div>
                ) : (
                    <Button onClick={startEditing} variant="outline" className="w-full border-dashed">Edit Usage Data</Button>
                )}

              </div>
            ) : (
                <form onSubmit={handleUpdate} className="space-y-6 animate-fade-in">
                    <div className="grid grid-cols-2 gap-6">
                       <div className="space-y-2">
                         <Label>Electricity (kWh)</Label>
                         <Input type="number" min="0" value={editForm.electricity} onChange={e => setEditForm({...editForm, electricity: e.target.value})} required className="bg-amber-50/50 focus:bg-white transition-colors" />
                       </div>
                       <div className="space-y-2">
                         <Label>Water (L)</Label>
                         <Input type="number" min="0" value={editForm.water} onChange={e => setEditForm({...editForm, water: e.target.value})} required className="bg-blue-50/50 focus:bg-white transition-colors" />
                       </div>
                       <div className="space-y-2">
                         <Label>Laundry (kg)</Label>
                         <Input type="number" min="0" value={editForm.laundry} onChange={e => setEditForm({...editForm, laundry: e.target.value})} required className="bg-purple-50/50 focus:bg-white transition-colors" />
                       </div>
                       <div className="space-y-2">
                         <Label>Meals (Count)</Label>
                         <Input type="number" min="0" value={editForm.meals} onChange={e => setEditForm({...editForm, meals: e.target.value})} required className="bg-green-50/50 focus:bg-white transition-colors" />
                       </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button type="submit" className="flex-1 gap-2"><Save className="w-4 h-4"/> Save Changes</Button>
                      <Button variant="secondary" type="button" onClick={() => setIsEditing(false)}>Cancel</Button>
                    </div>
                </form>
            )}
            
            {Number(entry.discount) > 0 && (
                <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 flex items-center gap-4">
                    <div className="p-2 bg-white rounded-full shadow-sm">
                      <Award className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                        <p className="font-bold text-emerald-900 text-lg">Eco-Reward Discount: {entry.discount}%</p>
                        <p className="text-sm text-emerald-700">Calculated based on carbon savings.</p>
                    </div>
                </div>
            )}

          </CardContent>
        </Card>
      </div>
    </div>
  );
}