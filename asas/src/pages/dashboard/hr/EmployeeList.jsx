import { useState } from 'react'
import { 
  Users, Briefcase, Search, Filter, Download, 
  MessageSquare, Calendar, X, Mail, Phone, ChevronRight
} from 'lucide-react'

// ── 1. The Data Contract (Mock API Response) ────────────────

const MOCK_EMPLOYEES = [
  {
    id: 'emp_001',
    name: 'Sarah Jenkins',
    role: 'Frontend Developer',
    department: 'Engineering',
    status: 'Active',
    location: 'Remote EST',
    email: 's.jenkins@asas.com',
    phone: '+1 555-019-2834',
    manager: 'Elena Rodriguez',
    compensation: { salaryBand: '$115,000 (L3 Senior)', equity: '12,000 Options' },
    avatar: 'SJ'
  },
  {
    id: 'emp_002',
    name: 'Marcus Chen',
    role: 'DevOps Engineer',
    department: 'Engineering',
    status: 'Active',
    location: 'San Francisco',
    email: 'm.chen@asas.com',
    phone: '+1 555-019-2835',
    manager: 'Elena Rodriguez',
    compensation: { salaryBand: '$125,000 (L3 Senior)', equity: '10,000 Options' },
    avatar: 'MC'
  },
  {
    id: 'emp_003',
    name: 'Elena Rodriguez',
    role: 'VP of Engineering',
    department: 'Engineering',
    status: 'On Leave',
    location: 'New York',
    email: 'e.rodriguez@asas.com',
    phone: '+1 555-019-2836',
    manager: 'CEO',
    compensation: { salaryBand: '$180,000 (L5 Director)', equity: '45,000 Options' },
    avatar: 'ER'
  }
]

const STATS = [
  { label: 'Total Headcount', value: '142', sub: '+3 this month', icon: Users },
  { label: 'Open Roles', value: '12', sub: 'Engineering & Sales', icon: Briefcase },
  { label: 'On Leave', value: '4', sub: 'Currently inactive', icon: Calendar },
]

// ── 2. The Right-Side Inspector Panel ───────────────────────

function EmployeeInspector({ employee, onClose }) {
  if (!employee) return null

  return (
    <div className="w-80 bg-white border-l border-gray-100 flex flex-col h-full flex-shrink-0">
      {/* Inspector Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Profile Overview</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        
        {/* Header Info */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
            {employee.avatar}
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">{employee.name}</h2>
            <p className="text-xs text-gray-500">{employee.role}</p>
            <span className={`inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              employee.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {employee.status}
            </span>
          </div>
        </div>

        {/* Contact Info */}
        <div>
          <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Contact Info</h4>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3 text-sm">
              <Mail size={14} className="text-gray-400" />
              <span className="text-gray-700">{employee.email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Phone size={14} className="text-gray-400" />
              <span className="text-gray-700">{employee.phone}</span>
            </div>
          </div>
        </div>

        {/* Employment Details */}
        <div>
          <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Employment Details</h4>
          <div className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-100 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Department</span>
              <span className="font-medium text-gray-900">{employee.department}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Manager</span>
              <span className="font-medium text-gray-900">{employee.manager}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Location</span>
              <span className="font-medium text-gray-900">{employee.location}</span>
            </div>
          </div>
        </div>

        {/* Compensation */}
        <div>
          <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Compensation</h4>
          <div className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-100 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Salary Band</span>
              <span className="font-medium text-gray-900">{employee.compensation.salaryBand}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Equity</span>
              <span className="font-medium text-gray-900">{employee.compensation.equity}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── 3. The Main Page Component ──────────────────────────────

export default function EmployeeList() {
  const [selectedEmpId, setSelectedEmpId] = useState(MOCK_EMPLOYEES[0].id)
  
  const selectedEmployee = MOCK_EMPLOYEES.find(e => e.id === selectedEmpId)

  return (
    <div className="flex h-full overflow-hidden bg-white">
      
      {/* ── Left Side: Main Content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Header & Stats */}
        <div className="p-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Employee Directory</h1>
              <p className="text-sm text-gray-500 mt-1">Manage your workforce and organization structure.</p>
            </div>
            <button className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
              + Add Employee
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {STATS.map(stat => (
              <div key={stat.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-500">{stat.label}</span>
                  <stat.icon size={14} className="text-gray-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-gray-900">{stat.value}</span>
                  <span className="text-[10px] font-medium text-gray-400">{stat.sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search employees..." 
                className="pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg bg-white w-64 focus:outline-none focus:border-gray-300 focus:ring-4 focus:ring-gray-100 transition-all"
              />
            </div>
            <button className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm px-3 py-1.5 rounded-lg hover:bg-gray-50">
              <Filter size={14} />
              Department: All
            </button>
          </div>
          <button className="flex items-center gap-2 text-gray-500 text-sm hover:text-gray-900 font-medium px-3 py-1.5">
            <Download size={14} />
            Export
          </button>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/80 sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th className="px-6 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">Employee</th>
                <th className="px-6 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">Department</th>
                <th className="px-6 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">Status</th>
                <th className="px-6 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {MOCK_EMPLOYEES.map(emp => (
                <tr 
                  key={emp.id}
                  onClick={() => setSelectedEmpId(emp.id)}
                  className={`group cursor-pointer transition-colors ${
                    selectedEmpId === emp.id ? 'bg-blue-50/50' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                        {emp.avatar}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{emp.name}</p>
                        <p className="text-xs text-gray-500">{emp.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600">{emp.department}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      emp.status === 'Active' ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'Active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      {emp.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                        <MessageSquare size={14} />
                      </button>
                      <button className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors">
                        <Calendar size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Right Side: Inspector Panel ── */}
      {selectedEmpId && (
        <EmployeeInspector 
          employee={selectedEmployee} 
          onClose={() => setSelectedEmpId(null)} 
        />
      )}

    </div>
  )
}